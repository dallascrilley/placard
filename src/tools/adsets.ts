/**
 * Ad Set Tools
 *
 * MCP tools for managing Meta ad sets.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";
import {
  ADSET_STATUSES,
  BID_STRATEGIES,
  BILLING_EVENTS,
  OPTIMIZATION_GOALS,
} from "../constants/index.js";
import {
  accountIdSchema,
  createLimitSchema,
  dailyBudgetSchema,
  lifetimeBudgetSchema,
  optionalTargetingSchema,
  targetingSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../utils/tool-responses.js";

export function registerAdSetTools(server: McpServer): void {
  /**
   * List ad sets for an ad account
   */
  server.tool(
    "get_adsets",
    "List ad sets for an ad account with optional filtering",
    {
      account_id: accountIdSchema,
      limit: createLimitSchema("ad sets"),
      campaign_id: z.string().optional().describe("Filter by campaign ID"),
      user_id: userIdSchema,
    },
    async ({ account_id, limit, campaign_id, user_id }) => {
      try {
        const normalizedId = normalizeAccountId(account_id);
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getAdSets(normalizedId, {
          limit: limit ?? 25,
          campaign_id,
        });

        return createSuccessResponse({
          adsets: response.data,
          paging: response.paging,
        });
      } catch (error) {
        return createErrorResponse(error);
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
      user_id: userIdSchema,
    },
    async ({ adset_id, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const adset = await client.getAdSetDetails(adset_id);

        return createSuccessResponse({ adset });
      } catch (error) {
        return createErrorResponse(error);
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
      user_id: userIdSchema,
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
        const normalizedId = normalizeAccountId(account_id);
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

        return createSuccessResponse({
          adset_id: result.id,
          message: `Ad set "${name}" created successfully`,
        });
      } catch (error) {
        return createErrorResponse(error);
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

        return createSuccessResponse({
          message: `Ad set ${adset_id} updated successfully`,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );
}
