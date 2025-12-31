/**
 * Campaign Tools
 *
 * MCP tools for managing Meta ad campaigns.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUSES,
  SPECIAL_AD_CATEGORIES,
} from "../constants/index.js";
import {
  accountIdSchema,
  createLimitSchema,
  dailyBudgetSchema,
  lifetimeBudgetSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../utils/tool-responses.js";

export function registerCampaignTools(server: McpServer): void {
  /**
   * List campaigns for an ad account
   */
  server.tool(
    "get_campaigns",
    "List campaigns for an ad account with optional filtering",
    {
      account_id: accountIdSchema,
      limit: createLimitSchema("campaigns"),
      status: z
        .enum(CAMPAIGN_STATUSES)
        .optional()
        .describe("Filter by campaign status"),
      user_id: userIdSchema,
    },
    async ({ account_id, limit, status, user_id }) => {
      try {
        const normalizedId = normalizeAccountId(account_id);
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getCampaigns(normalizedId, {
          limit: limit ?? 25,
          status,
        });

        return createSuccessResponse({
          campaigns: response.data,
          paging: response.paging,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );

  /**
   * Get detailed information about a specific campaign
   */
  server.tool(
    "get_campaign_details",
    "Get detailed information about a specific campaign",
    {
      campaign_id: z.string().describe("Campaign ID"),
      user_id: userIdSchema,
    },
    async ({ campaign_id, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const campaign = await client.getCampaignDetails(campaign_id);

        return createSuccessResponse({ campaign });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );

  /**
   * Create a new campaign
   */
  server.tool(
    "create_campaign",
    "Create a new advertising campaign",
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
      daily_budget: dailyBudgetSchema,
      lifetime_budget: lifetimeBudgetSchema,
      user_id: userIdSchema,
    },
    async ({
      account_id,
      name,
      objective,
      status,
      special_ad_categories,
      daily_budget,
      lifetime_budget,
      user_id,
    }) => {
      try {
        const normalizedId = normalizeAccountId(account_id);
        const client = createMetaClient({ userId: user_id ?? "default" });

        // Filter out "NONE" from special_ad_categories if present
        const filteredCategories = special_ad_categories?.filter(
          (cat) => cat !== "NONE",
        );

        const result = await client.createCampaign(normalizedId, {
          name,
          objective,
          status: status ?? "PAUSED",
          special_ad_categories:
            filteredCategories && filteredCategories.length > 0
              ? filteredCategories
              : [],
          daily_budget,
          lifetime_budget,
        });

        return createSuccessResponse({
          campaign_id: result.id,
          message: `Campaign "${name}" created successfully`,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );

  /**
   * Update an existing campaign
   */
  server.tool(
    "update_campaign",
    "Update an existing campaign's settings",
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
      user_id: userIdSchema,
    },
    async ({
      campaign_id,
      name,
      status,
      daily_budget,
      lifetime_budget,
      user_id,
    }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });

        const result = await client.updateCampaign(campaign_id, {
          name,
          status,
          daily_budget,
          lifetime_budget,
        });

        return createSuccessResponse({
          message: `Campaign ${campaign_id} updated successfully`,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );
}
