/**
 * Meta Marketing API Client
 *
 * HTTP client for the Meta Marketing API with automatic token refresh,
 * rate limiting, and structured error handling.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";
import type {
  Ad,
  AdAccount,
  AdCreative,
  AdSet,
  ApiResponse,
  Campaign,
  CustomAudience,
  Insights,
  ReachEstimate,
  TargetingSearchResult,
} from "../types/meta-api.js";
import { type MetaAuth, getDefaultMetaAuth } from "./auth.js";
import {
  AuthenticationError,
  MetaApiError,
  RateLimitError,
  parseApiError,
  sleep,
  withRetry,
} from "./error-handling.js";

const META_API_VERSION = process.env["META_API_VERSION"] ?? "v22.0";
const META_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60000;

function resolveDelayMs(
  optionValue: number | undefined,
  envValue: string | undefined,
  fallbackMs: number,
): number {
  if (typeof optionValue === "number" && Number.isFinite(optionValue)) {
    return Math.max(0, optionValue);
  }

  if (typeof envValue === "string" && envValue.trim().length > 0) {
    const parsed = Number.parseInt(envValue, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return fallbackMs;
}

export interface MetaClientOptions {
  accessToken?: string;
  userId?: string;
  auth?: MetaAuth;
  maxRetries?: number;
  minRequestIntervalMs?: number;
  rateLimitCooldownMs?: number;
}

export type LookalikeSpec =
  | { country: string; ratio: number }
  | { type: string; country: string; starting_ratio: number; ratio: number };

interface RateLimiterState {
  queueTail: Promise<void>;
  nextRequestAtMs: number;
}

export class MetaClient {
  private static limiterStates = new Map<string, RateLimiterState>();

  private accessToken: string | null;
  private userId: string;
  private auth: MetaAuth;
  private maxRetries: number;
  private minRequestIntervalMs: number;
  private rateLimitCooldownMs: number;

  constructor(options: MetaClientOptions = {}) {
    this.accessToken = options.accessToken ?? null;
    this.userId = options.userId ?? "default";
    this.auth = options.auth ?? getDefaultMetaAuth();
    this.maxRetries = options.maxRetries ?? 3;
    this.minRequestIntervalMs = resolveDelayMs(
      options.minRequestIntervalMs,
      process.env["META_API_MIN_REQUEST_INTERVAL_MS"],
      DEFAULT_MIN_REQUEST_INTERVAL_MS,
    );
    this.rateLimitCooldownMs = resolveDelayMs(
      options.rateLimitCooldownMs,
      process.env["META_API_RATE_LIMIT_COOLDOWN_MS"],
      DEFAULT_RATE_LIMIT_COOLDOWN_MS,
    );
  }

  private static isRateLimitCode(code: number): boolean {
    return (
      code === 4 || code === 17 || code === 32 || code === 613 || code === 80004
    );
  }

  private static getLimiterState(key: string): RateLimiterState {
    const existing = MetaClient.limiterStates.get(key);
    if (existing) {
      return existing;
    }

    const created: RateLimiterState = {
      queueTail: Promise.resolve(),
      nextRequestAtMs: 0,
    };
    MetaClient.limiterStates.set(key, created);
    return created;
  }

  private getRateLimiterKey(endpoint: string): string {
    const accountMatch = endpoint.match(/^\/(act_\d+)(?:\/|$)/);
    if (accountMatch?.[1]) {
      return `account:${accountMatch[1]}`;
    }

    return `user:${this.userId}`;
  }

  private async waitForRequestSlot(rateLimiterKey: string): Promise<void> {
    const limiterState = MetaClient.getLimiterState(rateLimiterKey);
    let releaseCurrentTurn: (() => void) | undefined;
    const currentTurn = new Promise<void>((resolve) => {
      releaseCurrentTurn = resolve;
    });

    const previousTurn = limiterState.queueTail;
    limiterState.queueTail = previousTurn.then(() => currentTurn);
    await previousTurn;

    try {
      const now = performance.now();
      const waitMs = Math.max(0, limiterState.nextRequestAtMs - now);
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      const scheduledAt = performance.now();
      limiterState.nextRequestAtMs = scheduledAt + this.minRequestIntervalMs;
    } finally {
      releaseCurrentTurn?.();
    }
  }

  private applyRateLimitCooldown(error: unknown, rateLimiterKey: string): void {
    if (!(error instanceof MetaApiError)) return;
    const isRateLimitError =
      error instanceof RateLimitError || MetaClient.isRateLimitCode(error.code);
    if (!isRateLimitError) return;

    const limiterState = MetaClient.getLimiterState(rateLimiterKey);
    const retryAfterMs =
      error instanceof RateLimitError && typeof error.retryAfter === "number"
        ? error.retryAfter * 1000
        : 0;
    const cooldownMs = Math.max(this.rateLimitCooldownMs, retryAfterMs);
    const cooldownUntil = performance.now() + cooldownMs;
    limiterState.nextRequestAtMs = Math.max(
      limiterState.nextRequestAtMs,
      cooldownUntil,
    );
  }

  /**
   * Test-only helper to isolate global request pacing state between tests.
   */
  static resetRateLimiterStateForTests(): void {
    MetaClient.limiterStates.clear();
  }

  /**
   * Get access token, fetching from auth if not provided
   */
  private async getToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    const token = this.auth.getAccessTokenForUser(this.userId);
    if (!token) {
      throw new AuthenticationError(
        "Not authenticated. Use meta_get_login_link to authenticate.",
      );
    }

    return token;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "DELETE";
      params?: Record<string, string | number | boolean | undefined>;
      body?: Record<string, unknown>;
    } = {},
  ): Promise<T> {
    const { method = "GET", params = {}, body } = options;

    return withRetry(
      async () => {
        const rateLimiterKey = this.getRateLimiterKey(endpoint);
        await this.waitForRequestSlot(rateLimiterKey);
        const token = await this.getToken();

        // Build URL with query params
        const url = new URL(`${META_API_BASE_URL}${endpoint}`);
        url.searchParams.set("access_token", token);

        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) {
            url.searchParams.set(key, String(value));
          }
        }

        // Make request
        const fetchOptions: RequestInit = {
          method,
          headers: {
            "Content-Type": "application/json",
          },
        };

        if (body && method === "POST") {
          fetchOptions.body = JSON.stringify(body);
        }

        try {
          const response = await fetch(url.toString(), fetchOptions);

          // Parse response
          const data = await response.json();

          if (!response.ok) {
            throw parseApiError(response, data);
          }

          return data as T;
        } catch (error) {
          this.applyRateLimitCooldown(error, rateLimiterKey);
          throw error;
        }
      },
      {
        maxRetries: this.maxRetries,
        onRetry: (error, attempt) => {
          console.error(
            `API request failed, retrying (attempt ${attempt}):`,
            error.message,
          );
        },
      },
    );
  }

  /**
   * Convert optional field selections into Meta API `fields` param.
   * Empty arrays should fall back to defaults rather than sending `fields=`.
   */
  private resolveFields(
    fields: string[] | undefined,
    defaultFields: string,
  ): string {
    return fields && fields.length > 0 ? fields.join(",") : defaultFields;
  }

  // ============================================
  // Ad Account Methods
  // ============================================

  /**
   * Get ad accounts accessible by the user
   */
  async getAdAccounts(
    limit = 25,
    fields?: string[] | undefined,
  ): Promise<ApiResponse<AdAccount>> {
    return this.request<ApiResponse<AdAccount>>("/me/adaccounts", {
      params: {
        fields: this.resolveFields(
          fields,
          "id,account_id,name,currency,timezone_name,account_status,amount_spent,balance,business",
        ),
        limit,
        summary: true,
      },
    });
  }

  /**
   * Get ad account details
   */
  async getAccountInfo(
    accountId: string,
    fields?: string[] | undefined,
  ): Promise<AdAccount> {
    return this.request<AdAccount>(`/${accountId}`, {
      params: {
        fields: this.resolveFields(
          fields,
          "id,account_id,name,currency,timezone_name,account_status,amount_spent,balance,business,funding_source_details",
        ),
      },
    });
  }

  /**
   * Get custom audiences for an ad account
   */
  async getCustomAudiences(
    accountId: string,
    options: {
      limit?: number | undefined;
      after?: string | undefined;
      before?: string | undefined;
      fields?: string[] | undefined;
    } = {},
  ): Promise<ApiResponse<CustomAudience>> {
    return this.request<ApiResponse<CustomAudience>>(
      `/${accountId}/customaudiences`,
      {
        params: {
          fields: this.resolveFields(
            options.fields,
            "id,name,subtype,approximate_count,time_created,time_updated",
          ),
          limit: options.limit ?? 25,
          after: options.after,
          before: options.before,
          summary: true,
        },
      },
    );
  }

  /**
   * Create a custom audience in an ad account
   */
  async createCustomAudience(
    accountId: string,
    data: {
      name: string;
      subtype?: string | undefined;
      description?: string | undefined;
      customer_file_source?: string | undefined;
      rule?: object | undefined;
      retention_days?: number | undefined;
    },
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      name: data.name,
      subtype: data.subtype ?? "CUSTOM",
    };

    if (data.description !== undefined) body["description"] = data.description;
    if (data.customer_file_source !== undefined) {
      body["customer_file_source"] = data.customer_file_source;
    }
    if (data.rule !== undefined) body["rule"] = data.rule;
    if (data.retention_days !== undefined) {
      body["retention_days"] = data.retention_days;
    }

    return this.request<{ id: string }>(`/${accountId}/customaudiences`, {
      method: "POST",
      body,
    });
  }

  /**
   * Create a lookalike audience in an ad account
   */
  async createLookalikeAudience(
    accountId: string,
    data: {
      name: string;
      origin_audience_id: string;
      lookalike_spec: LookalikeSpec;
      description?: string | undefined;
    },
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      name: data.name,
      subtype: "LOOKALIKE",
      origin_audience_id: data.origin_audience_id,
      lookalike_spec: data.lookalike_spec,
    };

    if (data.description !== undefined) body["description"] = data.description;

    return this.request<{ id: string }>(`/${accountId}/customaudiences`, {
      method: "POST",
      body,
    });
  }

  // ============================================
  // Campaign Methods
  // ============================================

  /**
   * Get campaigns for an ad account
   */
  async getCampaigns(
    accountId: string,
    options: {
      limit?: number | undefined;
      status?: string | undefined;
      after?: string | undefined;
      before?: string | undefined;
      fields?: string[] | undefined;
    } = {},
  ): Promise<ApiResponse<Campaign>> {
    const params: Record<string, string | number | boolean | undefined> = {
      fields: this.resolveFields(
        options.fields,
        "id,name,objective,status,effective_status,created_time,updated_time,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining,special_ad_categories",
      ),
      limit: options.limit ?? 25,
      after: options.after,
      before: options.before,
      summary: true,
    };

    if (options.status) {
      params["filtering"] = JSON.stringify([
        { field: "effective_status", operator: "IN", value: [options.status] },
      ]);
    }

    return this.request<ApiResponse<Campaign>>(`/${accountId}/campaigns`, {
      params,
    });
  }

  /**
   * Get campaign details
   */
  async getCampaignDetails(
    campaignId: string,
    fields?: string[] | undefined,
  ): Promise<Campaign> {
    return this.request<Campaign>(`/${campaignId}`, {
      params: {
        fields: this.resolveFields(
          fields,
          "id,name,objective,status,effective_status,created_time,updated_time,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining,special_ad_categories,special_ad_category,special_ad_category_country",
        ),
      },
    });
  }

  /**
   * Create a new campaign
   */
  async createCampaign(
    accountId: string,
    data: {
      name: string;
      objective: string;
      status?: string | undefined;
      special_ad_categories?: string[] | undefined;
      special_ad_category_country?: string[] | undefined;
      daily_budget?: number | undefined;
      lifetime_budget?: number | undefined;
      bid_strategy?: string | undefined;
      start_time?: string | undefined;
      stop_time?: string | undefined;
      promoted_object?: object | undefined;
      spend_cap?: number | undefined;
    },
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      name: data.name,
      objective: data.objective,
      status: data.status ?? "PAUSED",
      special_ad_categories: data.special_ad_categories ?? [],
      // Meta can default to bid-cap strategies when omitted; always send explicit safe default.
      bid_strategy: data.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP",
    };

    if (data.special_ad_category_country?.length)
      body["special_ad_category_country"] = data.special_ad_category_country;

    if (data.daily_budget !== undefined) {
      body["daily_budget"] = data.daily_budget;
    }
    if (data.lifetime_budget !== undefined) {
      body["lifetime_budget"] = data.lifetime_budget;
    }
    if (data.start_time !== undefined) body["start_time"] = data.start_time;
    if (data.stop_time !== undefined) body["stop_time"] = data.stop_time;
    if (data.promoted_object !== undefined) {
      body["promoted_object"] = JSON.stringify(data.promoted_object);
    }
    if (data.spend_cap !== undefined) body["spend_cap"] = data.spend_cap;

    return this.request<{ id: string }>(`/${accountId}/campaigns`, {
      method: "POST",
      body,
    });
  }

  /**
   * Update a campaign
   */
  async updateCampaign(
    campaignId: string,
    data: {
      name?: string | undefined;
      status?: string | undefined;
      daily_budget?: number | undefined;
      lifetime_budget?: number | undefined;
      bid_strategy?: string | undefined;
      start_time?: string | undefined;
      stop_time?: string | undefined;
      spend_cap?: number | undefined;
    },
  ): Promise<{ success: boolean }> {
    const body: Record<string, unknown> = {};

    if (data.name !== undefined) body["name"] = data.name;
    if (data.status !== undefined) body["status"] = data.status;
    if (data.daily_budget !== undefined)
      body["daily_budget"] = data.daily_budget;
    if (data.lifetime_budget !== undefined)
      body["lifetime_budget"] = data.lifetime_budget;
    if (data.bid_strategy !== undefined)
      body["bid_strategy"] = data.bid_strategy;
    if (data.start_time !== undefined) body["start_time"] = data.start_time;
    if (data.stop_time !== undefined) body["stop_time"] = data.stop_time;
    if (data.spend_cap !== undefined) body["spend_cap"] = data.spend_cap;

    return this.request<{ success: boolean }>(`/${campaignId}`, {
      method: "POST",
      body,
    });
  }

  // ============================================
  // Ad Set Methods
  // ============================================

  /**
   * Get ad sets for an ad account
   */
  async getAdSets(
    accountId: string,
    options: {
      limit?: number | undefined;
      campaign_id?: string | undefined;
      after?: string | undefined;
      before?: string | undefined;
      fields?: string[] | undefined;
    } = {},
  ): Promise<ApiResponse<AdSet>> {
    const params: Record<string, string | number | boolean | undefined> = {
      fields: this.resolveFields(
        options.fields,
        "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,lifetime_budget,budget_remaining,targeting,start_time,end_time,created_time,updated_time",
      ),
      limit: options.limit ?? 25,
      after: options.after,
      before: options.before,
      summary: true,
    };

    if (options.campaign_id) {
      params["filtering"] = JSON.stringify([
        { field: "campaign.id", operator: "EQUAL", value: options.campaign_id },
      ]);
    }

    return this.request<ApiResponse<AdSet>>(`/${accountId}/adsets`, {
      params,
    });
  }

  /**
   * Get ad set details
   */
  async getAdSetDetails(
    adsetId: string,
    fields?: string[] | undefined,
  ): Promise<AdSet> {
    return this.request<AdSet>(`/${adsetId}`, {
      params: {
        fields: this.resolveFields(
          fields,
          "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,lifetime_budget,budget_remaining,targeting,start_time,end_time,created_time,updated_time",
        ),
      },
    });
  }

  /**
   * Create a new ad set
   */
  async createAdSet(
    accountId: string,
    data: {
      name: string;
      campaign_id: string;
      optimization_goal: string;
      billing_event: string;
      targeting: object;
      status?: string | undefined;
      daily_budget?: number | undefined;
      lifetime_budget?: number | undefined;
      bid_amount?: number | undefined;
      bid_strategy?: string | undefined;
      start_time?: string | undefined;
      end_time?: string | undefined;
      promoted_object?: object | undefined;
      destination_type?: string | undefined;
      is_dynamic_creative?: boolean | undefined;
      pacing_type?: string | undefined;
    },
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      name: data.name,
      campaign_id: data.campaign_id,
      optimization_goal: data.optimization_goal,
      billing_event: data.billing_event,
      targeting: data.targeting,
      status: data.status ?? "PAUSED",
    };

    if (data.daily_budget !== undefined)
      body["daily_budget"] = data.daily_budget;
    if (data.lifetime_budget !== undefined)
      body["lifetime_budget"] = data.lifetime_budget;
    if (data.bid_amount !== undefined) body["bid_amount"] = data.bid_amount;
    if (data.bid_strategy !== undefined)
      body["bid_strategy"] = data.bid_strategy;
    if (data.start_time !== undefined) body["start_time"] = data.start_time;
    if (data.end_time !== undefined) body["end_time"] = data.end_time;
    if (data.promoted_object !== undefined) {
      body["promoted_object"] = JSON.stringify(data.promoted_object);
    }
    if (data.destination_type !== undefined)
      body["destination_type"] = data.destination_type;
    if (data.is_dynamic_creative !== undefined)
      body["is_dynamic_creative"] = data.is_dynamic_creative;
    if (data.pacing_type !== undefined)
      body["pacing_type"] = JSON.stringify([data.pacing_type]);

    return this.request<{ id: string }>(`/${accountId}/adsets`, {
      method: "POST",
      body,
    });
  }

  /**
   * Update an ad set
   */
  async updateAdSet(
    adsetId: string,
    data: {
      name?: string | undefined;
      status?: string | undefined;
      daily_budget?: number | undefined;
      lifetime_budget?: number | undefined;
      targeting?: object | undefined;
      bid_amount?: number | undefined;
      bid_strategy?: string | undefined;
      pacing_type?: string | undefined;
      promoted_object?: object | undefined;
    },
  ): Promise<{ success: boolean }> {
    const body: Record<string, unknown> = {};

    if (data.name !== undefined) body["name"] = data.name;
    if (data.status !== undefined) body["status"] = data.status;
    if (data.daily_budget !== undefined)
      body["daily_budget"] = data.daily_budget;
    if (data.lifetime_budget !== undefined)
      body["lifetime_budget"] = data.lifetime_budget;
    if (data.targeting !== undefined) body["targeting"] = data.targeting;
    if (data.bid_amount !== undefined) body["bid_amount"] = data.bid_amount;
    if (data.bid_strategy !== undefined)
      body["bid_strategy"] = data.bid_strategy;
    if (data.pacing_type !== undefined)
      body["pacing_type"] = JSON.stringify([data.pacing_type]);
    if (data.promoted_object !== undefined) {
      body["promoted_object"] = JSON.stringify(data.promoted_object);
    }

    return this.request<{ success: boolean }>(`/${adsetId}`, {
      method: "POST",
      body,
    });
  }

  // ============================================
  // Ad Methods
  // ============================================

  /**
   * Get ads for an ad account
   */
  async getAds(
    accountId: string,
    options: {
      limit?: number | undefined;
      adset_id?: string | undefined;
      campaign_id?: string | undefined;
      after?: string | undefined;
      before?: string | undefined;
      fields?: string[] | undefined;
    } = {},
  ): Promise<ApiResponse<Ad>> {
    const params: Record<string, string | number | boolean | undefined> = {
      fields: this.resolveFields(
        options.fields,
        "id,name,adset_id,campaign_id,status,effective_status,creative,created_time,updated_time",
      ),
      limit: options.limit ?? 25,
      after: options.after,
      before: options.before,
      summary: true,
    };

    const filters: Array<{ field: string; operator: "EQUAL"; value: string }> =
      [];

    if (options.adset_id) {
      filters.push({
        field: "adset.id",
        operator: "EQUAL",
        value: options.adset_id,
      });
    }

    if (options.campaign_id) {
      filters.push({
        field: "campaign.id",
        operator: "EQUAL",
        value: options.campaign_id,
      });
    }

    if (filters.length > 0) {
      params["filtering"] = JSON.stringify(filters);
    }

    return this.request<ApiResponse<Ad>>(`/${accountId}/ads`, {
      params,
    });
  }

  /**
   * Get ad details
   */
  async getAdDetails(adId: string, fields?: string[] | undefined): Promise<Ad> {
    return this.request<Ad>(`/${adId}`, {
      params: {
        fields: this.resolveFields(
          fields,
          "id,name,adset_id,campaign_id,status,effective_status,creative{id,name,body,title,object_story_spec,asset_feed_spec},created_time,updated_time,tracking_specs,conversion_specs",
        ),
      },
    });
  }

  /**
   * Get ads for a specific campaign
   */
  async getCampaignAds(
    campaignId: string,
    options: {
      limit?: number | undefined;
      after?: string | undefined;
      before?: string | undefined;
      fields?: string[] | undefined;
    } = {},
  ): Promise<ApiResponse<Ad>> {
    return this.request<ApiResponse<Ad>>(`/${campaignId}/ads`, {
      params: {
        fields: this.resolveFields(
          options.fields,
          "id,name,creative{id,body,title}",
        ),
        limit: options.limit ?? 100,
        after: options.after,
        before: options.before,
        summary: true,
      },
    });
  }

  /**
   * Create a new ad
   */
  async createAd(
    accountId: string,
    data: {
      name: string;
      adset_id: string;
      creative: { creative_id: string } | object;
      status?: string;
      tracking_specs?: object[];
    },
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      name: data.name,
      adset_id: data.adset_id,
      creative: data.creative,
      status: data.status ?? "PAUSED",
    };
    if (data.tracking_specs) {
      body["tracking_specs"] = JSON.stringify(data.tracking_specs);
    }
    return this.request<{ id: string }>(`/${accountId}/ads`, {
      method: "POST",
      body,
    });
  }

  /**
   * Update an ad
   */
  async updateAd(
    adId: string,
    data: {
      name?: string | undefined;
      status?: string | undefined;
    },
  ): Promise<{ success: boolean }> {
    const body: Record<string, unknown> = {};

    if (data.name !== undefined) body["name"] = data.name;
    if (data.status !== undefined) body["status"] = data.status;

    return this.request<{ success: boolean }>(`/${adId}`, {
      method: "POST",
      body,
    });
  }

  // ============================================
  // Creative Methods
  // ============================================

  /**
   * Get ad creatives for an ad account
   */
  async getAdCreatives(
    accountId: string,
    options: {
      limit?: number | undefined;
      after?: string | undefined;
      before?: string | undefined;
      fields?: string[] | undefined;
      campaign_id?: string | undefined;
    } = {},
  ): Promise<ApiResponse<AdCreative>> {
    const creativeFields = this.resolveFields(
      options.fields,
      "id,name,body,thumbnail_url",
    );

    if (options.campaign_id) {
      const adsResponse = await this.request<
        ApiResponse<{ creative?: AdCreative | undefined }>
      >(`/${accountId}/ads`, {
        params: {
          fields: `creative{${creativeFields}}`,
          limit: options.limit ?? 25,
          after: options.after,
          before: options.before,
          summary: true,
          filtering: JSON.stringify([
            {
              field: "campaign.id",
              operator: "EQUAL",
              value: options.campaign_id,
            },
          ]),
        },
      });

      const creativesById = new Map<string, AdCreative>();
      for (const ad of adsResponse.data) {
        const creative = ad.creative;
        if (creative?.id && !creativesById.has(creative.id)) {
          creativesById.set(creative.id, creative);
        }
      }

      return {
        data: Array.from(creativesById.values()),
        ...(adsResponse.paging ? { paging: adsResponse.paging } : {}),
      };
    }

    return this.request<ApiResponse<AdCreative>>(`/${accountId}/adcreatives`, {
      params: {
        fields: creativeFields,
        limit: options.limit ?? 25,
        after: options.after,
        before: options.before,
        summary: true,
      },
    });
  }

  /**
   * Create an ad creative
   */
  async createAdCreative(
    accountId: string,
    data: {
      name: string;
      object_story_spec?: object | undefined;
      asset_feed_spec?: object | undefined;
      url_tags?: string | undefined;
      instagram_actor_id?: string | undefined;
      degrees_of_freedom_spec?: object | undefined;
      applink_treatment?: string | undefined;
    },
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = { name: data.name };

    if (data.object_story_spec !== undefined) {
      body["object_story_spec"] = data.object_story_spec;
    }

    if (data.asset_feed_spec !== undefined) {
      body["asset_feed_spec"] = data.asset_feed_spec;
    }
    if (data.url_tags !== undefined) {
      body["url_tags"] = data.url_tags;
    }
    if (data.instagram_actor_id !== undefined) {
      body["instagram_actor_id"] = data.instagram_actor_id;
    }
    if (data.degrees_of_freedom_spec !== undefined) {
      body["degrees_of_freedom_spec"] = data.degrees_of_freedom_spec;
    }
    if (data.applink_treatment !== undefined) {
      body["applink_treatment"] = data.applink_treatment;
    }

    return this.request<{ id: string }>(`/${accountId}/adcreatives`, {
      method: "POST",
      body,
    });
  }

  // ============================================
  // Ad Images
  // ============================================

  /**
   * Upload an ad image and return its hash for use in creatives.
   */
  async uploadAdImage(
    accountId: string,
    options: { filePath?: string; url?: string },
  ): Promise<{ image_hash: string; filename: string }> {
    const { filePath, url } = options;
    if (!filePath && !url) {
      throw new Error("Either filePath or url is required");
    }
    if (filePath && url) {
      throw new Error("Provide filePath or url, not both");
    }

    let base64: string;
    let filename: string;

    if (filePath) {
      const buffer = await readFile(filePath);
      base64 = buffer.toString("base64");
      filename = basename(filePath);
    } else {
      const imageUrl = url;
      if (!imageUrl) {
        throw new Error("Either filePath or url is required");
      }
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      base64 = Buffer.from(buffer).toString("base64");
      const pathname = new URL(imageUrl).pathname;
      filename =
        pathname && pathname !== "/" ? basename(pathname) : "image.jpg";
    }

    const formData = new FormData();
    formData.append("bytes", base64);
    formData.append("name", filename);

    const token = await this.getToken();
    const apiUrl = `${META_API_BASE_URL}/${accountId}/adimages?access_token=${encodeURIComponent(token)}`;

    const uploadResponse = await fetch(apiUrl, {
      method: "POST",
      body: formData,
    });

    const data = (await uploadResponse.json()) as {
      images?: Record<string, { hash?: string }>;
      error?: { message: string; code: number };
    };

    if (!uploadResponse.ok) {
      throw parseApiError(uploadResponse, data);
    }

    const images = data.images;
    if (!images || typeof images !== "object") {
      throw new Error("Unexpected adimages response: no images object");
    }

    const entry = Object.entries(images)[0];
    if (!entry) {
      throw new Error("Unexpected adimages response: empty images");
    }

    const [key, meta] = entry;
    const hash = meta?.hash;
    if (!hash || typeof hash !== "string") {
      throw new Error("Unexpected adimages response: no hash");
    }

    return { image_hash: hash, filename: key };
  }

  /**
   * Resolve the CDN URL for an image hash already stored in the ad account.
   * Used to build link_data.picture (preferred over image_hash-only for link ads).
   */
  async getAdImageUrlByHash(
    accountId: string,
    imageHash: string,
  ): Promise<string | null> {
    const hashes = JSON.stringify([imageHash]);
    const result = await this.request<{
      data?: { hash?: string; url?: string }[];
    }>(`/${accountId}/adimages`, {
      params: {
        hashes,
        fields: "hash,url",
      },
    });
    const row =
      result.data?.find((entry) => entry.hash === imageHash) ??
      result.data?.[0];
    return typeof row?.url === "string" ? row.url : null;
  }

  // ============================================
  // Targeting Methods
  // ============================================

  /**
   * Search for targeting options
   */
  async searchTargeting(
    type: string,
    query: string,
    limit = 25,
  ): Promise<{ data: TargetingSearchResult[] }> {
    return this.request<{ data: TargetingSearchResult[] }>("/search", {
      params: {
        type,
        q: query,
        limit,
      },
    });
  }

  /**
   * Get reach estimate for targeting
   */
  async getReachEstimate(
    accountId: string,
    targeting: object,
  ): Promise<{ data: ReachEstimate }> {
    return this.request<{ data: ReachEstimate }>(
      `/${accountId}/reachestimate`,
      {
        params: {
          targeting_spec: JSON.stringify(targeting),
        },
      },
    );
  }

  // ============================================
  // Insights Methods
  // ============================================

  /**
   * Get insights for an object (account, campaign, adset, ad)
   */
  async getInsights(
    objectId: string,
    options: {
      time_range?: { since: string; until: string } | undefined;
      date_preset?: string | undefined;
      level?: string | undefined;
      breakdown?: string | undefined;
      fields?: string[] | undefined;
    } = {},
  ): Promise<{ data: Insights[] }> {
    const params: Record<string, string | number | undefined> = {
      fields:
        options.fields?.join(",") ??
        "impressions,clicks,spend,reach,frequency,cpm,cpp,ctr,cpc,actions,conversions,cost_per_action_type",
      level: options.level ?? "account",
    };

    if (options.time_range) {
      params["time_range"] = JSON.stringify(options.time_range);
    } else if (options.date_preset) {
      params["date_preset"] = options.date_preset;
    } else {
      params["date_preset"] = "maximum";
    }

    if (options.breakdown) {
      params["breakdowns"] = options.breakdown;
    }

    return this.request<{ data: Insights[] }>(`/${objectId}/insights`, {
      params,
    });
  }
}

// Default client factory
export function createMetaClient(options: MetaClientOptions = {}): MetaClient {
  return new MetaClient(options);
}
