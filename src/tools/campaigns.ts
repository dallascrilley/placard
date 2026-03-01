/**
 * Campaign Tools
 *
 * MCP tools for managing Meta ad campaigns.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  BID_STRATEGIES,
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUSES,
  CREATE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  SPECIAL_AD_CATEGORIES,
  UPDATE_ANNOTATIONS,
} from "../constants/index.js";
import {
  accountIdSchema,
  createLimitSchema,
  dailyBudgetSchema,
  fieldsSchema,
  lifetimeBudgetSchema,
  paginationCursorSchema,
  promotedObjectSchema,
  responseFormatSchema,
  userIdSchema,
} from "../schemas/index.js";
import { compareEntities } from "../utils/entity-compare.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import {
  createErrorResponse,
  createSuccessResponse,
  enhancePagination,
} from "../utils/tool-responses.js";

const DEFAULT_CAMPAIGN_COMPARE_IGNORE_FIELDS = [
  "id",
  "account_id",
  "created_time",
  "updated_time",
  "effective_status",
  "budget_remaining",
];

export function validateStopTimeBudgetCompatibility(
  stop_time: string | undefined,
  budget: {
    daily_budget?: number | string | undefined;
    lifetime_budget?: number | string | undefined;
  },
): string | null {
  if (!stop_time) {
    return null;
  }

  const hasDailyBudget =
    budget.daily_budget !== undefined && budget.daily_budget !== null;
  const hasLifetimeBudget =
    budget.lifetime_budget !== undefined && budget.lifetime_budget !== null;

  if (hasDailyBudget && !hasLifetimeBudget) {
    return "stop_time is only honored on lifetime_budget campaigns. For daily_budget campaigns, Meta may ignore stop_time. Use lifetime_budget when scheduling an end date.";
  }

  return null;
}

export function validateTimestampTimezone(
  field: "start_time" | "stop_time",
  value: string | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  if (!hasTimezone) {
    return `${field} must include a timezone offset (for example +0000 or -0700). Received: "${value}"`;
  }

  return null;
}

export function registerCampaignTools(server: McpServer): void {
  /**
   * List campaigns for an ad account
   */
  server.tool(
    "meta_get_campaigns",
    `List campaigns for an ad account with optional filtering.

Retrieves advertising campaigns from a Meta ad account, supporting status filtering and pagination. Returns campaign details including name, objective, status, budget, and performance metrics.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - limit (number, optional): Maximum campaigns to return, 1-100 (default: 25)
  - after (string, optional): Pagination cursor to fetch the next page
  - before (string, optional): Pagination cursor to fetch the previous page
  - fields (array[string], optional): Specific campaign fields to return
  - status (string, optional): Filter by status: ACTIVE, PAUSED, DELETED, ARCHIVED
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "campaigns": [
      {
        "id": "123456789",
        "name": "Summer Sale Campaign",
        "objective": "OUTCOME_TRAFFIC",
        "status": "ACTIVE",
        "daily_budget": 5000,
        "lifetime_budget": null
      }
    ],
    "paging": {
      "cursors": {
        "before": "...",
        "after": "..."
      },
      "next": "https://graph.facebook.com/v22.0/act_123/campaigns?..."
    }
  }

Examples:
  - Active campaigns: { "account_id": "act_123", "status": "ACTIVE" }
  - Next page: { "account_id": "act_123", "after": "QVFI..." }
  - Minimal fields: { "account_id": "act_123", "fields": ["id", "name", "status"] }
  - With limit: { "account_id": "act_123", "limit": 50 }
  - All campaigns: { "account_id": "act_123" }
  - Markdown format: { "account_id": "act_123", "response_format": "markdown" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to account`,
    {
      account_id: accountIdSchema,
      limit: createLimitSchema("campaigns"),
      after: paginationCursorSchema,
      before: paginationCursorSchema,
      fields: fieldsSchema,
      status: z
        .enum(CAMPAIGN_STATUSES)
        .optional()
        .describe("Filter by campaign status"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, limit, after, before, fields, status },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const response = await client.getCampaigns(normalizedId, {
          limit: limit ?? 25,
          after,
          before,
          fields,
          status,
        });

        return createSuccessResponse(
          {
            campaigns: response.data,
            paging: enhancePagination(response.paging, response.data, {
              totalCount: response.summary?.total_count,
              limit: limit ?? 25,
              cursorProvided: !!after || !!before,
            }),
          },
          format,
        );
      },
    ),
  );

  /**
   * Get deduplicated ad copy text for a campaign
   */
  server.tool(
    "meta_get_campaign_copy",
    `Get deduplicated ad copy text for a campaign.

Retrieves ads under a campaign, extracts creative body text, and returns unique copy strings in one call. This is optimized for agent workflows that need "just the ad copy" without traversing ads and creatives manually.

Args:
  - campaign_id (string, required): Campaign ID
  - limit (number, optional): Ads to scan per page, 1-100 (default: 100)
  - max_pages (number, optional): Maximum pages to scan, 1-20 (default: 10)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "campaign_id": "123456789",
    "copy_texts": [
      "Body copy variant A",
      "Body copy variant B"
    ],
    "total_unique_copy": 2,
    "total_ads_scanned": 37,
    "paging": {
      "scanned_pages": 1,
      "has_more": false
    }
  }

Examples:
  - Get campaign copy: { "campaign_id": "123456789" }
  - Scan more pages: { "campaign_id": "123456789", "max_pages": 20 }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 100: Invalid campaign ID format
  - 10/200/294: Permission denied - user lacks access to this campaign`,
    {
      campaign_id: z.string().describe("Campaign ID"),
      limit: createLimitSchema("ads per page"),
      max_pages: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum pages to scan (default: 10)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async ({ campaign_id, limit, max_pages }, { client, format }) => {
        const pageLimit = limit ?? 100;
        const pageCap = max_pages ?? 10;
        const uniqueCopy = new Set<string>();
        let adsScanned = 0;
        let pagesScanned = 0;
        let afterCursor: string | undefined;
        let hasMore = false;

        while (pagesScanned < pageCap) {
          const response = await client.getCampaignAds(campaign_id, {
            limit: pageLimit,
            after: afterCursor,
          });

          pagesScanned += 1;
          adsScanned += response.data.length;

          for (const ad of response.data) {
            const body = ad.creative?.body?.trim();
            if (body) {
              uniqueCopy.add(body);
            }
          }

          const nextCursor = response.paging?.cursors?.after;
          hasMore = !!response.paging?.next && !!nextCursor;
          if (!hasMore || !nextCursor) {
            afterCursor = undefined;
            break;
          }
          afterCursor = nextCursor;
        }

        const paging: Record<string, unknown> = {
          scanned_pages: pagesScanned,
          has_more: hasMore,
        };
        if (afterCursor) {
          paging["next_after"] = afterCursor;
        }

        return createSuccessResponse(
          {
            campaign_id,
            copy_texts: Array.from(uniqueCopy),
            total_unique_copy: uniqueCopy.size,
            total_ads_scanned: adsScanned,
            paging,
          },
          format,
        );
      },
    ),
  );

  /**
   * Get detailed information about a specific campaign
   */
  server.tool(
    "meta_get_campaign_details",
    `Get detailed information about a specific campaign.

Retrieves comprehensive details about a single campaign including all settings, budget configuration, special ad categories, and current status. Useful for inspecting campaign configuration before updates.

Args:
  - campaign_id (string, required): Campaign ID
  - fields (array[string], optional): Specific campaign fields to return
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "campaign": {
      "id": "123456789",
      "name": "Summer Sale Campaign",
      "objective": "OUTCOME_TRAFFIC",
      "status": "ACTIVE",
      "daily_budget": 5000,
      "lifetime_budget": null,
      "special_ad_categories": [],
      "created_time": "2025-01-01T00:00:00+0000",
      "updated_time": "2025-01-15T12:00:00+0000"
    }
  }

Examples:
  - Get campaign details: { "campaign_id": "123456789" }
  - Minimal fields: { "campaign_id": "123456789", "fields": ["id", "name", "status"] }
  - Markdown format: { "campaign_id": "123456789", "response_format": "markdown" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 100: Invalid campaign ID format
  - 10/200/294: Permission denied - user lacks access to this campaign`,
    {
      campaign_id: z.string().describe("Campaign ID"),
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(async ({ campaign_id, fields }, { client, format }) => {
      const campaign = await client.getCampaignDetails(campaign_id, fields);

      return createSuccessResponse({ campaign }, format);
    }),
  );

  /**
   * Duplicate a campaign into a target ad account
   */
  server.tool(
    "meta_duplicate_campaign",
    `Duplicate a campaign into a target ad account.

Copies campaign configuration from a source campaign and creates a new campaign in the target account. This helps replicate known-good reference campaigns into another account for testing or migration workflows.

Args:
  - source_campaign_id (string, required): Campaign ID to copy from
  - target_account_id (string, required): Destination ad account ID (with or without 'act_' prefix)
  - name (string, optional): Name for duplicated campaign (default: source name + " (Copy)")
  - status (string, optional): Initial status for duplicated campaign - ACTIVE or PAUSED (default: PAUSED)
  - copy_budget (boolean, optional): Copy source daily/lifetime budget values (default: true)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "campaign_id": "999888777",
    "source_campaign_id": "123456789",
    "target_account_id": "act_123",
    "message": "Campaign duplicated successfully"
  }`,
    {
      source_campaign_id: z.string().describe("Campaign ID to duplicate"),
      target_account_id: accountIdSchema,
      name: z
        .string()
        .min(1)
        .optional()
        .describe("Name for the duplicated campaign"),
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .describe("Initial status for duplicated campaign (default: PAUSED)"),
      copy_budget: z
        .boolean()
        .optional()
        .describe("Copy source daily/lifetime budget values (default: true)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async (
        { source_campaign_id, target_account_id, name, status, copy_budget },
        { client, format },
      ) => {
        const sourceCampaign =
          await client.getCampaignDetails(source_campaign_id);
        const normalizedTargetId = normalizeAccountId(target_account_id);
        const copyBudget = copy_budget ?? true;
        const filteredCategories = sourceCampaign.special_ad_categories?.filter(
          (category) => category !== "NONE",
        );

        const result = await client.createCampaign(normalizedTargetId, {
          name: name ?? `${sourceCampaign.name} (Copy)`,
          objective: sourceCampaign.objective,
          status: status ?? "PAUSED",
          special_ad_categories: filteredCategories,
          special_ad_category_country:
            sourceCampaign.special_ad_category_country,
          daily_budget: copyBudget
            ? sourceCampaign.daily_budget
              ? Number(sourceCampaign.daily_budget)
              : undefined
            : undefined,
          lifetime_budget: copyBudget
            ? sourceCampaign.lifetime_budget
              ? Number(sourceCampaign.lifetime_budget)
              : undefined
            : undefined,
          start_time: sourceCampaign.start_time,
          stop_time: sourceCampaign.stop_time,
          promoted_object: sourceCampaign.promoted_object,
        });

        return createSuccessResponse(
          {
            campaign_id: result.id,
            source_campaign_id,
            target_account_id: normalizedTargetId,
            message: "Campaign duplicated successfully",
          },
          format,
        );
      },
    ),
  );

  /**
   * Compare two campaigns and return field-level differences
   */
  server.tool(
    "meta_compare_campaigns",
    `Compare two campaigns and return field-level differences.

Fetches both campaigns, normalizes nested values, and reports exact field differences. Useful for validating MCP/agent-created campaigns against known-good reference campaigns.

Args:
  - source_campaign_id (string, required): Reference campaign ID
  - target_campaign_id (string, required): Campaign ID to compare against reference
  - ignore_fields (array[string], optional): Additional field paths to ignore (e.g., ["name", "special_ad_category_country"])
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "match": false,
    "source_campaign_id": "123",
    "target_campaign_id": "456",
    "summary": {
      "total_compared_fields": 10,
      "matched_fields": 8,
      "different_fields": 2,
      "missing_in_source": 0,
      "missing_in_target": 0
    },
    "differences": [
      {
        "field": "objective",
        "status": "different",
        "source_value": "OUTCOME_TRAFFIC",
        "target_value": "OUTCOME_LEADS"
      }
    ]
  }`,
    {
      source_campaign_id: z.string().describe("Reference campaign ID"),
      target_campaign_id: z.string().describe("Campaign ID to compare"),
      ignore_fields: z
        .array(z.string().min(1))
        .optional()
        .describe("Additional field paths to ignore in comparison"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { source_campaign_id, target_campaign_id, ignore_fields },
        { client, format },
      ) => {
        const [sourceCampaign, targetCampaign] = await Promise.all([
          client.getCampaignDetails(source_campaign_id),
          client.getCampaignDetails(target_campaign_id),
        ]);

        const compareResult = compareEntities(
          sourceCampaign as unknown as Record<string, unknown>,
          targetCampaign as unknown as Record<string, unknown>,
          {
            ignoreFields: [
              ...DEFAULT_CAMPAIGN_COMPARE_IGNORE_FIELDS,
              ...(ignore_fields ?? []),
            ],
          },
        );

        return createSuccessResponse(
          {
            source_campaign_id,
            target_campaign_id,
            ...compareResult,
          },
          format,
        );
      },
    ),
  );

  /**
   * Create a new campaign
   */
  server.tool(
    "meta_create_campaign",
    `Create a new advertising campaign.

Creates a new Meta advertising campaign with the specified objective, budget, and settings. Campaigns are created in PAUSED status by default to allow review before activation. Supports both daily and lifetime budgets (exactly one required).

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - name (string, required): Campaign name (min 1 character)
  - objective (string, required): Campaign objective (OUTCOME_* format for API v22.0+). Options: OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_APP_PROMOTION, OUTCOME_SALES, OUTCOME_AWARENESS
  - status (string, optional): Initial campaign status - ACTIVE or PAUSED (default: PAUSED)
  - special_ad_categories (array, optional): Special ad categories if applicable. Required for housing, employment, credit, political ads. Options: HOUSING, EMPLOYMENT, CREDIT, POLITICAL_AND_ISSUE_ADS
  - daily_budget (number, optional): Daily budget in cents (e.g., 1000 = $10.00). Required if lifetime_budget not provided.
  - lifetime_budget (number, optional): Lifetime budget in cents (e.g., 10000 = $100.00). Required if daily_budget not provided.
  - bid_strategy (string, optional): Bid strategy. Options: LOWEST_COST_WITHOUT_CAP (default, recommended), LOWEST_COST_WITH_BID_CAP, COST_CAP, LOWEST_COST_WITH_MIN_ROAS
  - start_time (string, optional): Campaign start time in ISO 8601 format with timezone offset (for example "2026-03-01T00:00:00+0000")
  - stop_time (string, optional): Campaign stop time in ISO 8601 format with timezone offset. Meta only reliably honors stop_time on lifetime_budget campaigns.
  - promoted_object (object, optional): Promoted object for event/app campaigns. Fields: event_id, application_id, pixel_id, custom_event_type, etc.
  - spend_cap (number, optional): Hard cap on total campaign spend in cents (e.g., 50000 = $500). Different from lifetime_budget.
  - special_ad_category_country (array, optional): ISO country codes (e.g. ['US']). Required when special_ad_categories includes HOUSING, EMPLOYMENT, CREDIT, or ISSUES_ELECTIONS_POLITICS.
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "campaign_id": "123456789",
    "message": "Campaign \"Summer Sale\" created successfully"
  }

Examples:
  - Daily budget campaign: { "account_id": "act_123", "name": "Summer Sale", "objective": "OUTCOME_TRAFFIC", "daily_budget": 5000 }
  - Lifetime budget: { "account_id": "act_123", "name": "Holiday Promo", "objective": "OUTCOME_SALES", "lifetime_budget": 50000 }
  - With special category: { "account_id": "act_123", "name": "Job Posting", "objective": "OUTCOME_LEADS", "daily_budget": 3000, "special_ad_categories": ["EMPLOYMENT"] }
  - With bid strategy: { "account_id": "act_123", "name": "Sales Campaign", "objective": "OUTCOME_SALES", "daily_budget": 5000, "bid_strategy": "LOWEST_COST_WITHOUT_CAP" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_management permission
  - 100: Invalid account ID or missing required fields
  - 1885501: Budget too low - minimum daily budget is $1.00 (100 cents)
  - 1885502: Budget too high - exceeds account spending limit`,
    {
      account_id: accountIdSchema,
      name: z.string().min(1).describe("Campaign name"),
      objective: z
        .enum(CAMPAIGN_OBJECTIVES)
        .describe("Campaign objective (OUTCOME_* format for API v22.0+)"),
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .describe("Initial campaign status (default: PAUSED)"),
      special_ad_categories: z
        .array(z.enum(SPECIAL_AD_CATEGORIES))
        .optional()
        .describe(
          "Special ad categories if applicable (required for housing, employment, credit, political ads)",
        ),
      special_ad_category_country: z
        .array(z.string().length(2))
        .optional()
        .describe(
          "ISO country codes when using special_ad_categories (e.g. ['US']). Required for HOUSING, EMPLOYMENT, CREDIT, ISSUES_ELECTIONS_POLITICS.",
        ),
      daily_budget: dailyBudgetSchema.describe(
        "Daily budget in cents (required if no lifetime_budget)",
      ),
      lifetime_budget: lifetimeBudgetSchema.describe(
        "Lifetime budget in cents (required if no daily_budget)",
      ),
      bid_strategy: z
        .enum(BID_STRATEGIES)
        .optional()
        .describe(
          "Bid strategy. Options: LOWEST_COST_WITHOUT_CAP (default, recommended), LOWEST_COST_WITH_BID_CAP, COST_CAP, LOWEST_COST_WITH_MIN_ROAS",
        ),
      start_time: z
        .string()
        .optional()
        .describe(
          "Campaign start time in ISO 8601 format (e.g., '2026-03-01T00:00:00+0000')",
        ),
      stop_time: z
        .string()
        .optional()
        .describe(
          "Campaign stop time in ISO 8601 format (reliable with lifetime_budget campaigns)",
        ),
      promoted_object: promotedObjectSchema,
      spend_cap: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Hard cap on total campaign spend in cents"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async (
        {
          account_id,
          name,
          objective,
          status,
          special_ad_categories,
          special_ad_category_country,
          daily_budget,
          lifetime_budget,
          bid_strategy,
          start_time,
          stop_time,
          promoted_object,
          spend_cap,
        },
        { client, format },
      ) => {
        const startTimeTzErr = validateTimestampTimezone(
          "start_time",
          start_time,
        );
        if (startTimeTzErr) {
          return createErrorResponse(new Error(startTimeTzErr), format);
        }
        const stopTimeTzErr = validateTimestampTimezone("stop_time", stop_time);
        if (stopTimeTzErr) {
          return createErrorResponse(new Error(stopTimeTzErr), format);
        }

        if (daily_budget === undefined && lifetime_budget === undefined) {
          return createErrorResponse(
            new Error(
              "Either daily_budget or lifetime_budget is required. Provide at least one budget type.",
            ),
            format,
          );
        }

        const stopTimeErr = validateStopTimeBudgetCompatibility(stop_time, {
          daily_budget,
          lifetime_budget,
        });
        if (stopTimeErr) {
          return createErrorResponse(new Error(stopTimeErr), format);
        }

        const filteredCategories = special_ad_categories?.filter(
          (cat: string) => cat !== "NONE",
        );
        const hasSpecialCategory =
          filteredCategories && filteredCategories.length > 0;
        const requiresCountry =
          hasSpecialCategory &&
          filteredCategories?.some(
            (c: string) =>
              c === "EMPLOYMENT" ||
              c === "HOUSING" ||
              c === "CREDIT" ||
              c === "ISSUES_ELECTIONS_POLITICS",
          );
        if (
          requiresCountry &&
          (!special_ad_category_country ||
            special_ad_category_country.length === 0)
        ) {
          return createErrorResponse(
            new Error(
              "special_ad_category_country is required when using special_ad_categories for HOUSING, EMPLOYMENT, CREDIT, or ISSUES_ELECTIONS_POLITICS. Provide ISO country codes (e.g. ['US']).",
            ),
            format,
          );
        }

        const normalizedId = normalizeAccountId(account_id);

        const result = await client.createCampaign(normalizedId, {
          name,
          objective,
          status: status ?? "PAUSED",
          special_ad_categories: hasSpecialCategory ? filteredCategories : [],
          special_ad_category_country,
          daily_budget,
          lifetime_budget,
          bid_strategy,
          start_time,
          stop_time,
          promoted_object,
          spend_cap,
        });

        return createSuccessResponse(
          {
            campaign_id: result.id,
            message: `Campaign "${name}" created successfully`,
          },
          format,
        );
      },
    ),
  );

  /**
   * Update an existing campaign
   */
  server.tool(
    "meta_update_campaign",
    `Update an existing campaign's settings.

Modifies an existing campaign's name, status, or budget configuration. All parameters are optional - only provided fields will be updated. Budget changes require either daily_budget or lifetime_budget (not both).

Args:
  - campaign_id (string, required): Campaign ID to update
  - name (string, optional): New campaign name (min 1 character)
  - status (string, optional): New campaign status - ACTIVE, PAUSED, DELETED, ARCHIVED. To soft-delete a campaign, set status: DELETED.
  - daily_budget (number, optional): New daily budget in cents (e.g., 1000 = $10.00). Cannot be set if lifetime_budget is provided.
  - lifetime_budget (number, optional): New lifetime budget in cents (e.g., 10000 = $100.00). Cannot be set if daily_budget is provided.
  - bid_strategy (string, optional): New bid strategy. Options: LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP, LOWEST_COST_WITH_MIN_ROAS
  - start_time (string, optional): New campaign start time in ISO 8601 format with timezone offset
  - stop_time (string, optional): New campaign stop time in ISO 8601 format with timezone offset. Meta only reliably honors stop_time on lifetime_budget campaigns.
  - spend_cap (number, optional): New hard cap on total campaign spend in cents
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "message": "Campaign 123456789 updated successfully"
  }

Examples:
  - Update name: { "campaign_id": "123", "name": "Updated Campaign Name" }
  - Pause campaign: { "campaign_id": "123", "status": "PAUSED" }
  - Soft-delete campaign: { "campaign_id": "123", "status": "DELETED" }
  - Change budget: { "campaign_id": "123", "daily_budget": 7500 }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_management permission
  - 100: Invalid campaign ID or conflicting budget parameters
  - 1885501: Budget too low - minimum daily budget is $1.00 (100 cents)
  - 1885502: Budget too high - exceeds account spending limit`,
    {
      campaign_id: z.string().describe("Campaign ID to update"),
      name: z.string().min(1).optional().describe("New campaign name"),
      status: z
        .enum(CAMPAIGN_STATUSES)
        .optional()
        .describe("New campaign status"),
      daily_budget: dailyBudgetSchema.describe(
        "New daily budget in cents (e.g., 1000 = $10.00)",
      ),
      lifetime_budget: lifetimeBudgetSchema.describe(
        "New lifetime budget in cents (e.g., 10000 = $100.00)",
      ),
      bid_strategy: z
        .enum(BID_STRATEGIES)
        .optional()
        .describe("New bid strategy"),
      start_time: z
        .string()
        .optional()
        .describe(
          "Campaign start time in ISO 8601 format with timezone offset (e.g., 2026-03-01T00:00:00+0000)",
        ),
      stop_time: z
        .string()
        .optional()
        .describe(
          "Campaign stop time in ISO 8601 format (reliable with lifetime_budget campaigns)",
        ),
      spend_cap: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Hard cap on total campaign spend in cents"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    UPDATE_ANNOTATIONS,
    withToolHandler(
      async (
        {
          campaign_id,
          name,
          status,
          daily_budget,
          lifetime_budget,
          bid_strategy,
          start_time,
          stop_time,
          spend_cap,
        },
        { client, format },
      ) => {
        const startTimeTzErr = validateTimestampTimezone(
          "start_time",
          start_time,
        );
        if (startTimeTzErr) {
          return createErrorResponse(new Error(startTimeTzErr), format);
        }
        const stopTimeTzErr = validateTimestampTimezone("stop_time", stop_time);
        if (stopTimeTzErr) {
          return createErrorResponse(new Error(stopTimeTzErr), format);
        }

        const directStopTimeErr = validateStopTimeBudgetCompatibility(
          stop_time,
          {
            daily_budget,
            lifetime_budget,
          },
        );
        if (directStopTimeErr) {
          return createErrorResponse(new Error(directStopTimeErr), format);
        }

        if (
          stop_time !== undefined &&
          lifetime_budget === undefined &&
          daily_budget === undefined
        ) {
          try {
            const campaign = await client.getCampaignDetails(campaign_id, [
              "id",
              "daily_budget",
              "lifetime_budget",
            ]);
            const existingBudgetErr = validateStopTimeBudgetCompatibility(
              stop_time,
              {
                daily_budget: campaign.daily_budget,
                lifetime_budget: campaign.lifetime_budget,
              },
            );
            if (existingBudgetErr) {
              return createErrorResponse(new Error(existingBudgetErr), format);
            }
          } catch {
            // Best-effort validation: proceed if budget lookup fails.
          }
        }

        await client.updateCampaign(campaign_id, {
          name,
          status,
          daily_budget,
          lifetime_budget,
          bid_strategy,
          start_time,
          stop_time,
          spend_cap,
        });

        return createSuccessResponse(
          {
            message: `Campaign ${campaign_id} updated successfully`,
          },
          format,
        );
      },
    ),
  );

  /**
   * Soft-delete a campaign
   */
  server.tool(
    "meta_delete_campaign",
    `Soft-delete a campaign by setting its status to DELETED.

Convenience wrapper for meta_update_campaign with status: DELETED. Campaigns are not permanently removed; they can be filtered out of lists.

Args:
  - campaign_id (string, required): Campaign ID to delete
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "message": "Campaign 123456789 deleted successfully"
  }

Examples:
  - Delete campaign: { "campaign_id": "123456789" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied
  - 100: Invalid campaign ID`,
    {
      campaign_id: z.string().describe("Campaign ID to delete"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    UPDATE_ANNOTATIONS,
    withToolHandler(async ({ campaign_id }, { client, format }) => {
      await client.updateCampaign(campaign_id, { status: "DELETED" });
      return createSuccessResponse(
        { message: `Campaign ${campaign_id} deleted successfully` },
        format,
      );
    }),
  );
}
