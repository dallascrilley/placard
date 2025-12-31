/**
 * Campaign Tools
 *
 * MCP tools for managing Meta ad campaigns.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";

// Valid campaign objectives for Meta API v22.0
const CAMPAIGN_OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_TRAFFIC",
  "OUTCOME_APP_PROMOTION",
] as const;

// Valid campaign statuses
const CAMPAIGN_STATUSES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"] as const;

// Special ad categories
const SPECIAL_AD_CATEGORIES = [
  "NONE",
  "EMPLOYMENT",
  "HOUSING",
  "CREDIT",
  "ISSUES_ELECTIONS_POLITICS",
] as const;

export function registerCampaignTools(server: McpServer): void {
  /**
   * List campaigns for an ad account
   */
  server.tool(
    "get_campaigns",
    "List campaigns for an ad account with optional filtering",
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
        .describe("Maximum number of campaigns to return (default: 25)"),
      status: z
        .enum(CAMPAIGN_STATUSES)
        .optional()
        .describe("Filter by campaign status"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ account_id, limit, status, user_id }) => {
      try {
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getCampaigns(normalizedId, {
          limit: limit ?? 25,
          status,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  campaigns: response.data,
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
   * Get detailed information about a specific campaign
   */
  server.tool(
    "get_campaign_details",
    "Get detailed information about a specific campaign",
    {
      campaign_id: z.string().describe("Campaign ID"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ campaign_id, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const campaign = await client.getCampaignDetails(campaign_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  campaign,
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
   * Create a new campaign
   */
  server.tool(
    "create_campaign",
    "Create a new advertising campaign",
    {
      account_id: z
        .string()
        .describe("Ad account ID (with or without 'act_' prefix)"),
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
      daily_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Daily budget in cents (e.g., 1000 = $10.00)"),
      lifetime_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Lifetime budget in cents (e.g., 10000 = $100.00)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
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
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

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

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  campaign_id: result.id,
                  message: `Campaign "${name}" created successfully`,
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
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
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

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  message: `Campaign ${campaign_id} updated successfully`,
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
