/**
 * Ad Set Tools
 *
 * MCP tools for managing Meta ad sets.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function validateAdvantageAgeConstraint(
  targeting: Record<string, unknown>,
): string | null {
  const automation = targeting?.["targeting_automation"] as
    | Record<string, unknown>
    | undefined;
  const advantageAudience = automation?.["advantage_audience"];
  const ageMax = targeting?.["age_max"] as number | undefined;

  if (ageMax !== undefined && ageMax < 65) {
    if (advantageAudience === undefined || advantageAudience !== 0) {
      return `age_max (${ageMax}) is below 65. With Advantage+ audience (the default), Meta requires age_max to be 65.`;
    }
  }
  return null;
}

import { z } from "zod";
import {
  ADSET_STATUSES,
  BID_STRATEGIES,
  BILLING_EVENTS,
  CREATE_ANNOTATIONS,
  DESTINATION_TYPES,
  OPTIMIZATION_GOALS,
  READ_ONLY_ANNOTATIONS,
  UPDATE_ANNOTATIONS,
} from "../constants/index.js";
import {
  accountIdSchema,
  createLimitSchema,
  dailyBudgetSchema,
  fieldsSchema,
  lifetimeBudgetSchema,
  optionalTargetingSchema,
  paginationCursorSchema,
  promotedObjectSchema,
  responseFormatSchema,
  targetingSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import {
  createErrorResponse,
  createSuccessResponse,
  enhancePagination,
} from "../utils/tool-responses.js";

export function registerAdSetTools(server: McpServer): void {
  /**
   * List ad sets for an ad account
   */
  server.tool(
    "meta_get_adsets",
    `List ad sets for an ad account with optional filtering.

Retrieves ad sets from a Meta ad account, with optional filtering by campaign ID. Returns ad set details including targeting, budget, bid strategy, and status. Supports pagination for large result sets.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - limit (number, optional): Maximum ad sets to return, 1-100 (default: 25)
  - after (string, optional): Pagination cursor to fetch the next page
  - before (string, optional): Pagination cursor to fetch the previous page
  - fields (array[string], optional): Specific ad set fields to return
  - campaign_id (string, optional): Filter by campaign ID to get ad sets for a specific campaign
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "adsets": [
      {
        "id": "123456789",
        "name": "Ad Set 1",
        "campaign_id": "987654321",
        "status": "ACTIVE",
        "daily_budget": 2500,
        "optimization_goal": "LINK_CLICKS",
        "billing_event": "IMPRESSIONS"
      }
    ],
    "paging": {
      "cursors": {
        "before": "...",
        "after": "..."
      },
      "next": "https://graph.facebook.com/v22.0/act_123/adsets?..."
    }
  }

Examples:
  - All ad sets: { "account_id": "act_123" }
  - Filter by campaign: { "account_id": "act_123", "campaign_id": "987654321" }
  - Minimal fields: { "account_id": "act_123", "fields": ["id", "name", "campaign_id"] }
  - Next page: { "account_id": "act_123", "after": "QVFI..." }
  - With limit: { "account_id": "act_123", "limit": 50 }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to account`,
    {
      account_id: accountIdSchema,
      limit: createLimitSchema("ad sets"),
      after: paginationCursorSchema,
      before: paginationCursorSchema,
      fields: fieldsSchema,
      campaign_id: z.string().optional().describe("Filter by campaign ID"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, limit, after, before, fields, campaign_id },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const response = await client.getAdSets(normalizedId, {
          limit: limit ?? 25,
          after,
          before,
          fields,
          campaign_id,
        });

        return createSuccessResponse(
          {
            adsets: response.data,
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
   * Get detailed information about a specific ad set
   */
  server.tool(
    "meta_get_adset_details",
    `Get detailed information about a specific ad set.

Retrieves comprehensive details about a single ad set including targeting configuration, budget, bid strategy, optimization goals, and scheduling. Useful for inspecting ad set settings before updates.

Args:
  - adset_id (string, required): Ad set ID
  - fields (array[string], optional): Specific ad set fields to return
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "adset": {
      "id": "123456789",
      "name": "Ad Set 1",
      "campaign_id": "987654321",
      "status": "ACTIVE",
      "daily_budget": 2500,
      "lifetime_budget": null,
      "optimization_goal": "LINK_CLICKS",
      "billing_event": "IMPRESSIONS",
      "targeting": {
        "age_min": 18,
        "age_max": 65,
        "genders": [1, 2],
        "geo_locations": { "countries": ["US"] }
      },
      "bid_amount": 100,
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
    }
  }

Examples:
  - Get ad set details: { "adset_id": "123456789" }
  - Minimal fields: { "adset_id": "123456789", "fields": ["id", "name", "status"] }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 100: Invalid ad set ID format
  - 10/200/294: Permission denied - user lacks access to this ad set`,
    {
      adset_id: z.string().describe("Ad set ID"),
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(async ({ adset_id, fields }, { client, format }) => {
      const adset = await client.getAdSetDetails(adset_id, fields);

      return createSuccessResponse({ adset }, format);
    }),
  );

  /**
   * Create a new ad set
   */
  server.tool(
    "meta_create_adset",
    `Create a new ad set within a campaign.

Creates a new ad set with targeting, budget, optimization goals, and bid strategy. Ad sets are created in PAUSED status by default. Requires exactly one budget type (daily_budget or lifetime_budget). Targeting must be specified using the targeting parameter.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - name (string, required): Ad set name (min 1 character)
  - campaign_id (string, required): Parent campaign ID
  - optimization_goal (string, required): What the ad set optimizes for. Options: LINK_CLICKS, OUTCOME_CLICKS, IMPRESSIONS, REACH, LANDING_PAGE_VIEWS, POST_ENGAGEMENT, THRUPLAY, etc.
  - billing_event (string, required): Billing event type. Options: IMPRESSIONS, LINK_CLICKS, OFFER_CLAIMS, PAGE_LIKES, POST_ENGAGEMENT, THRUPLAY
  - targeting (object, required): Targeting specification object with geo_locations, age_min, age_max, genders, interests, behaviors, etc. Note: When using Advantage+ audience (targeting.targeting_automation.advantage_audience = 1 or omitted), age_max must be 65. Meta rejects age_max < 65 with "Maximum age is below threshold". For restrictive age targeting, set targeting_automation.advantage_audience = 0.
  - status (string, optional): Initial ad set status - ACTIVE or PAUSED (default: PAUSED)
  - daily_budget (number, optional): Daily budget in cents (e.g., 1000 = $10.00). Required if lifetime_budget not provided.
  - lifetime_budget (number, optional): Lifetime budget in cents (e.g., 10000 = $100.00). Required if daily_budget not provided.
  - bid_amount (number, optional): Bid amount in cents (required for some optimization goals)
  - bid_strategy (string, optional): Bid strategy. Options: LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP, TARGET_COST
  - start_time (string, optional): Start time in ISO 8601 format (e.g., "2025-01-01T00:00:00+0000")
  - promoted_object (object, optional): Promoted object for conversion/event/app ad sets. Required for OFFSITE_CONVERSIONS. Fields: pixel_id, custom_event_type (PURCHASE, LEAD, COMPLETE_REGISTRATION, etc.), event_id, application_id, object_store_url, offer_id, page_id
  - destination_type (string, optional): Where users go after click. Must match objective/optimization_goal. Options: PHONE_CALL, MESSENGER, WHATSAPP, FACEBOOK, WEBSITE, etc.
  - end_time (string, optional): End time in ISO 8601 format
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "adset_id": "123456789",
    "message": "Ad set \"My Ad Set\" created successfully"
  }

Examples:
  - Basic ad set: { "account_id": "act_123", "name": "US Adults 25-45", "campaign_id": "987", "optimization_goal": "LINK_CLICKS", "billing_event": "IMPRESSIONS", "targeting": { "age_min": 25, "age_max": 45, "geo_locations": { "countries": ["US"] } }, "daily_budget": 2500 }
  - Purchase conversion: { "account_id": "act_123", "name": "Purchase Conversions", "campaign_id": "987", "optimization_goal": "OFFSITE_CONVERSIONS", "billing_event": "IMPRESSIONS", "targeting": { "geo_locations": { "countries": ["US"] } }, "daily_budget": 2500, "promoted_object": { "pixel_id": "123456", "custom_event_type": "PURCHASE" } }
  - With lifetime budget: { "account_id": "act_123", "name": "Limited Run", "campaign_id": "987", "optimization_goal": "IMPRESSIONS", "billing_event": "IMPRESSIONS", "targeting": { "geo_locations": { "countries": ["US"] } }, "lifetime_budget": 10000 }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_management permission
  - 100: Invalid account/campaign ID or missing required fields
  - 1885501: Budget too low - minimum daily budget is $1.00 (100 cents)
  - 1885502: Budget too high - exceeds account spending limit
  - 1487654: Invalid targeting specification`,
    {
      account_id: accountIdSchema,
      name: z.string().min(1).describe("Ad set name"),
      campaign_id: z.string().describe("Parent campaign ID"),
      optimization_goal: z
        .enum(OPTIMIZATION_GOALS)
        .describe("What the ad set is optimizing for"),
      billing_event: z.enum(BILLING_EVENTS).describe("Billing event type"),
      targeting: targetingSchema,
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .describe("Initial ad set status (default: PAUSED)"),
      daily_budget: dailyBudgetSchema,
      lifetime_budget: lifetimeBudgetSchema,
      bid_amount: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Bid amount in cents"),
      bid_strategy: z.enum(BID_STRATEGIES).optional().describe("Bid strategy"),
      start_time: z
        .string()
        .optional()
        .describe("Start time in ISO 8601 format"),
      end_time: z.string().optional().describe("End time in ISO 8601 format"),
      promoted_object: promotedObjectSchema,
      destination_type: z
        .enum(DESTINATION_TYPES)
        .optional()
        .describe(
          "Where users go after click (PHONE_CALL, MESSENGER, FACEBOOK, etc.). Must match objective/optimization_goal.",
        ),
      is_dynamic_creative: z
        .boolean()
        .optional()
        .describe(
          "Enable Advantage+ dynamic creative. Set at creation only — cannot change later.",
        ),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async (
        {
          account_id,
          name,
          campaign_id,
          optimization_goal,
          billing_event,
          targeting,
          status,
          daily_budget,
          lifetime_budget,
          bid_amount,
          bid_strategy,
          start_time,
          end_time,
          promoted_object,
          destination_type,
          is_dynamic_creative,
        },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);

        const err = validateAdvantageAgeConstraint(
          targeting as Record<string, unknown>,
        );
        if (err) {
          return createErrorResponse(
            new Error(
              `${err} Either set age_max to 65 (Meta uses it as a suggestion) or set targeting.targeting_automation.advantage_audience to 0 to disable Advantage+ audience.`,
            ),
            format,
          );
        }

        const result = await client.createAdSet(normalizedId, {
          name,
          campaign_id,
          optimization_goal,
          billing_event,
          targeting,
          status: status ?? "PAUSED",
          daily_budget,
          lifetime_budget,
          bid_amount,
          bid_strategy,
          start_time,
          end_time,
          promoted_object,
          destination_type,
          is_dynamic_creative,
        });

        return createSuccessResponse(
          {
            adset_id: result.id,
            message: `Ad set "${name}" created successfully`,
          },
          format,
        );
      },
    ),
  );

  /**
   * Update an existing ad set
   */
  server.tool(
    "meta_update_adset",
    `Update an existing ad set's settings.

Modifies an existing ad set's name, status, budget, targeting, or bid strategy. All parameters are optional - only provided fields will be updated. Budget changes require either daily_budget or lifetime_budget (not both).

Args:
  - adset_id (string, required): Ad set ID to update
  - name (string, optional): New ad set name (min 1 character)
  - status (string, optional): New ad set status - ACTIVE, PAUSED, DELETED, ARCHIVED
  - daily_budget (number, optional): New daily budget in cents (e.g., 1000 = $10.00). Cannot be set if lifetime_budget is provided.
  - lifetime_budget (number, optional): New lifetime budget in cents (e.g., 10000 = $100.00). Cannot be set if daily_budget is provided.
  - targeting (object, optional): New targeting specification object
  - bid_amount (number, optional): New bid amount in cents
  - bid_strategy (string, optional): New bid strategy. Options: LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP, TARGET_COST
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "message": "Ad set 123456789 updated successfully"
  }

Examples:
  - Update name: { "adset_id": "123", "name": "Updated Ad Set Name" }
  - Pause ad set: { "adset_id": "123", "status": "PAUSED" }
  - Change budget: { "adset_id": "123", "daily_budget": 5000 }
  - Update targeting: { "adset_id": "123", "targeting": { "age_min": 30, "age_max": 50, "geo_locations": { "countries": ["US", "CA"] } } }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_management permission
  - 100: Invalid ad set ID or conflicting budget parameters
  - 1885501: Budget too low - minimum daily budget is $1.00 (100 cents)
  - 1885502: Budget too high - exceeds account spending limit
  - 1487654: Invalid targeting specification`,
    {
      adset_id: z.string().describe("Ad set ID to update"),
      name: z.string().min(1).optional().describe("New ad set name"),
      status: z.enum(ADSET_STATUSES).optional().describe("New ad set status"),
      daily_budget: dailyBudgetSchema.describe(
        "New daily budget in cents (e.g., 1000 = $10.00)",
      ),
      lifetime_budget: lifetimeBudgetSchema.describe(
        "New lifetime budget in cents (e.g., 10000 = $100.00)",
      ),
      targeting: optionalTargetingSchema,
      bid_amount: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("New bid amount in cents"),
      bid_strategy: z
        .enum(BID_STRATEGIES)
        .optional()
        .describe("New bid strategy"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    UPDATE_ANNOTATIONS,
    withToolHandler(
      async (
        {
          adset_id,
          name,
          status,
          daily_budget,
          lifetime_budget,
          targeting,
          bid_amount,
          bid_strategy,
        },
        { client, format },
      ) => {
        await client.updateAdSet(adset_id, {
          name,
          status,
          daily_budget,
          lifetime_budget,
          targeting,
          bid_amount,
          bid_strategy,
        });

        return createSuccessResponse(
          {
            message: `Ad set ${adset_id} updated successfully`,
          },
          format,
        );
      },
    ),
  );
}
