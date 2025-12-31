/**
 * Ad Tools
 *
 * MCP tools for managing Meta ads.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";

// Valid ad statuses
const AD_STATUSES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"] as const;

export function registerAdTools(server: McpServer): void {
  /**
   * List ads for an ad account
   */
  server.tool(
    "get_ads",
    "List ads for an ad account with optional filtering",
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
        .describe("Maximum number of ads to return (default: 25)"),
      adset_id: z.string().optional().describe("Filter by ad set ID"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ account_id, limit, adset_id, user_id }) => {
      try {
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getAds(normalizedId, {
          limit: limit ?? 25,
          adset_id,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  ads: response.data,
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
   * Get detailed information about a specific ad
   */
  server.tool(
    "get_ad_details",
    "Get detailed information about a specific ad",
    {
      ad_id: z.string().describe("Ad ID"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ ad_id, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const ad = await client.getAdDetails(ad_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  ad,
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
   * Create a new ad
   */
  server.tool(
    "create_ad",
    "Create a new ad within an ad set",
    {
      account_id: z
        .string()
        .describe("Ad account ID (with or without 'act_' prefix)"),
      name: z.string().min(1).describe("Ad name"),
      adset_id: z.string().describe("Parent ad set ID"),
      creative_id: z
        .string()
        .optional()
        .describe("Existing creative ID to use"),
      creative: z
        .record(z.unknown())
        .optional()
        .describe("Inline creative specification (if not using creative_id)"),
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .describe("Initial ad status (default: PAUSED)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({
      account_id,
      name,
      adset_id,
      creative_id,
      creative,
      status,
      user_id,
    }) => {
      try {
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

        // Build creative object
        let creativeSpec: { creative_id: string } | object;
        if (creative_id) {
          creativeSpec = { creative_id };
        } else if (creative) {
          creativeSpec = creative;
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error:
                      "Either creative_id or creative specification is required",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const client = createMetaClient({ userId: user_id ?? "default" });

        const result = await client.createAd(normalizedId, {
          name,
          adset_id,
          creative: creativeSpec,
          status: status ?? "PAUSED",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  ad_id: result.id,
                  message: `Ad "${name}" created successfully`,
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
   * Update an existing ad
   */
  server.tool(
    "update_ad",
    "Update an existing ad's settings",
    {
      ad_id: z.string().describe("Ad ID to update"),
      name: z.string().min(1).optional().describe("New ad name"),
      status: z.enum(AD_STATUSES).optional().describe("New ad status"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ ad_id, name, status, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });

        const result = await client.updateAd(ad_id, {
          name,
          status,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.success,
                  message: `Ad ${ad_id} updated successfully`,
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
