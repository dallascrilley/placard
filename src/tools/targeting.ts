/**
 * Targeting Tools
 *
 * MCP tools for Meta ad targeting search and reach estimation.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";

// Valid targeting search types
const TARGETING_TYPES = [
  "adinterest",
  "adinterestsuggestion",
  "adinterestvalid",
  "adlocale",
  "adTargetingCategory",
  "adgeolocation",
  "adgeolocationmeta",
  "adradiussuggestion",
  "adworkemployer",
  "adworkposition",
  "adeducationschool",
  "adeducationmajor",
  "adrelationshipstatus",
  "adindustry",
] as const;

export function registerTargetingTools(server: McpServer): void {
  /**
   * Search for targeting options
   */
  server.tool(
    "search_targeting",
    "Search for targeting options by type (interests, locations, demographics, etc.)",
    {
      type: z
        .enum(TARGETING_TYPES)
        .describe(
          "Type of targeting to search for (e.g., 'adinterest', 'adgeolocation')",
        ),
      query: z.string().min(1).describe("Search query"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of results (default: 25)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ type, query, limit, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.searchTargeting(type, query, limit ?? 25);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  targeting_type: type,
                  query,
                  results: response.data,
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
   * Get reach estimate for targeting
   */
  server.tool(
    "get_reach_estimate",
    "Get estimated reach for a targeting specification",
    {
      account_id: z
        .string()
        .describe("Ad account ID (with or without 'act_' prefix)"),
      targeting: z
        .record(z.unknown())
        .describe(
          "Targeting specification object (geo_locations, interests, age_min, age_max, etc.)",
        ),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ account_id, targeting, user_id }) => {
      try {
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getReachEstimate(normalizedId, targeting);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  reach_estimate: response.data,
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
