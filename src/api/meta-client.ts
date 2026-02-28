/**
 * Meta Marketing API Client
 *
 * HTTP client for the Meta Marketing API with automatic token refresh,
 * rate limiting, and structured error handling.
 */

import type {
  Ad,
  AdAccount,
  AdCreative,
  AdSet,
  ApiResponse,
  Campaign,
  Insights,
  ReachEstimate,
  TargetingSearchResult,
} from "../types/meta-api.js";
import { type MetaAuth, getDefaultMetaAuth } from "./auth.js";
import {
  AuthenticationError,
  parseApiError,
  withRetry,
} from "./error-handling.js";

const META_API_VERSION = process.env["META_API_VERSION"] ?? "v22.0";
const META_API_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaClientOptions {
  accessToken?: string;
  userId?: string;
  auth?: MetaAuth;
  maxRetries?: number;
}

export class MetaClient {
  private accessToken: string | null;
  private userId: string;
  private auth: MetaAuth;
  private maxRetries: number;

  constructor(options: MetaClientOptions = {}) {
    this.accessToken = options.accessToken ?? null;
    this.userId = options.userId ?? "default";
    this.auth = options.auth ?? getDefaultMetaAuth();
    this.maxRetries = options.maxRetries ?? 3;
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
        "Not authenticated. Use get_login_link to authenticate.",
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

        const response = await fetch(url.toString(), fetchOptions);

        // Parse response
        const data = await response.json();

        if (!response.ok) {
          throw parseApiError(response, data);
        }

        return data as T;
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
    const params: Record<string, string | number | undefined> = {
      fields: this.resolveFields(
        options.fields,
        "id,name,objective,status,effective_status,created_time,updated_time,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining,special_ad_categories",
      ),
      limit: options.limit ?? 25,
      after: options.after,
      before: options.before,
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
      daily_budget?: number | undefined;
      lifetime_budget?: number | undefined;
    },
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      name: data.name,
      objective: data.objective,
      status: data.status ?? "PAUSED",
      special_ad_categories: data.special_ad_categories ?? [],
    };

    if (data.daily_budget !== undefined) {
      body["daily_budget"] = data.daily_budget;
    }
    if (data.lifetime_budget !== undefined) {
      body["lifetime_budget"] = data.lifetime_budget;
    }

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
    },
  ): Promise<{ success: boolean }> {
    const body: Record<string, unknown> = {};

    if (data.name !== undefined) body["name"] = data.name;
    if (data.status !== undefined) body["status"] = data.status;
    if (data.daily_budget !== undefined)
      body["daily_budget"] = data.daily_budget;
    if (data.lifetime_budget !== undefined)
      body["lifetime_budget"] = data.lifetime_budget;

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
    const params: Record<string, string | number | undefined> = {
      fields: this.resolveFields(
        options.fields,
        "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,lifetime_budget,budget_remaining,targeting,start_time,end_time,created_time,updated_time",
      ),
      limit: options.limit ?? 25,
      after: options.after,
      before: options.before,
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
    const params: Record<string, string | number | undefined> = {
      fields: this.resolveFields(
        options.fields,
        "id,name,adset_id,campaign_id,status,effective_status,creative,created_time,updated_time",
      ),
      limit: options.limit ?? 25,
      after: options.after,
      before: options.before,
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
   * Create a new ad
   */
  async createAd(
    accountId: string,
    data: {
      name: string;
      adset_id: string;
      creative: { creative_id: string } | object;
      status?: string;
    },
  ): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/${accountId}/ads`, {
      method: "POST",
      body: {
        name: data.name,
        adset_id: data.adset_id,
        creative: data.creative,
        status: data.status ?? "PAUSED",
      },
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
    } = {},
  ): Promise<ApiResponse<AdCreative>> {
    return this.request<ApiResponse<AdCreative>>(`/${accountId}/adcreatives`, {
      params: {
        fields: this.resolveFields(
          options.fields,
          "id,name,title,body,image_hash,image_url,video_id,object_story_spec,asset_feed_spec,call_to_action_type,link_url,thumbnail_url",
        ),
        limit: options.limit ?? 25,
        after: options.after,
        before: options.before,
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
      object_story_spec: object;
    },
  ): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/${accountId}/adcreatives`, {
      method: "POST",
      body: {
        name: data.name,
        object_story_spec: data.object_story_spec,
      },
    });
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
