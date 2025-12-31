/**
 * Ad Set Tools
 *
 * MCP tools for managing Meta ad sets.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";

// Valid optimization goals
const OPTIMIZATION_GOALS = [
  "NONE",
  "APP_INSTALLS",
  "AD_RECALL_LIFT",
  "ENGAGED_USERS",
  "EVENT_RESPONSES",
  "IMPRESSIONS",
  "LEAD_GENERATION",
  "QUALITY_LEAD",
  "LINK_CLICKS",
  "OFFSITE_CONVERSIONS",
  "PAGE_LIKES",
  "POST_ENGAGEMENT",
  "QUALITY_CALL",
  "REACH",
  "LANDING_PAGE_VIEWS",
  "VISIT_INSTAGRAM_PROFILE",
  "VALUE",
  "THRUPLAY",
  "DERIVED_EVENTS",
  "APP_INSTALLS_AND_OFFSITE_CONVERSIONS",
  "CONVERSATIONS",
  "IN_APP_VALUE",
  "MESSAGING_PURCHASE_CONVERSION",
  "SUBSCRIBERS",
  "REMINDERS_SET",
  "MEANINGFUL_CALL_ATTEMPT",
  "PROFILE_VISIT",
] as const;

// Valid billing events
const BILLING_EVENTS = [
  "APP_INSTALLS",
  "CLICKS",
  "IMPRESSIONS",
  "LINK_CLICKS",
  "NONE",
  "OFFER_CLAIMS",
  "PAGE_LIKES",
  "POST_ENGAGEMENT",
  "THRUPLAY",
  "PURCHASE",
  "LISTING_INTERACTION",
] as const;

// Valid bid strategies
const BID_STRATEGIES = [
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
] as const;

// Valid ad set statuses
const ADSET_STATUSES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"] as const;

export function registerAdSetTools(server: McpServer): void {
  /**
   * List ad sets for an ad account
   */
  server.tool(
    "get_adsets",
    "List ad sets for an ad account with optional filtering",
    {
      account_id: z
        .string()
        .describe("Ad account ID (with or without 'act_' prefix)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of ad sets to return (default: 25)"),
      campaign_id: z.string().optional().describe("Filter by campaign ID"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ account_id, limit, campaign_id, user_id }) => {
      try {
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getAdSets(normalizedId, {
          limit: limit ?? 25,
          campaign_id,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  adsets: response.data,
                  paging: response.paging,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );

  /**
   * Get detailed information about a specific ad set
   */
  server.tool(
    "get_adset_details",
    "Get detailed information about a specific ad set",
    {
      adset_id: z.string().describe("Ad set ID"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ adset_id, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const adset = await client.getAdSetDetails(adset_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  adset,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );

  /**
   * Create a new ad set
   */
  server.tool(
    "create_adset",
    "Create a new ad set within a campaign",
    {
      account_id: z
        .string()
        .describe("Ad account ID (with or without 'act_' prefix)"),
      name: z.string().min(1).describe("Ad set name"),
      campaign_id: z.string().describe("Parent campaign ID"),
      optimization_goal: z
        .enum(OPTIMIZATION_GOALS)
        .describe("What the ad set is optimizing for"),
      billing_event: z.enum(BILLING_EVENTS).describe("Billing event type"),
      targeting: z
        .record(z.unknown())
        .describe("Targeting specification object"),
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .describe("Initial ad set status (default: PAUSED)"),
      daily_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Daily budget in cents"),
      lifetime_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Lifetime budget in cents"),
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
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({
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
      user_id,
    }) => {
      try {
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

        const client = createMetaClient({ userId: user_id ?? "default" });

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
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  adset_id: result.id,
                  message: `Ad set "${name}" created successfully`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );

  /**
   * Update an existing ad set
   */
  server.tool(
    "update_adset",
    "Update an existing ad set's settings",
    {
      adset_id: z.string().describe("Ad set ID to update"),
      name: z.string().min(1).optional().describe("New ad set name"),
      status: z.enum(ADSET_STATUSES).optional().describe("New ad set status"),
      daily_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("New daily budget in cents"),
      lifetime_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("New lifetime budget in cents"),
      targeting: z
        .record(z.unknown())
        .optional()
        .describe("New targeting specification"),
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
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({
      adset_id,
      name,
      status,
      daily_budget,
      lifetime_budget,
      targeting,
      bid_amount,
      bid_strategy,
      user_id,
    }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });

        const result = await client.updateAdSet(adset_id, {
          name,
          status,
          daily_budget,
          lifetime_budget,
          targeting,
          bid_amount,
          bid_strategy,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  message: `Ad set ${adset_id} updated successfully`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
