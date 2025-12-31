/**
 * Targeting Tools
 *
 * MCP tools for Meta ad targeting search and reach estimation.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";
import { TARGETING_TYPES } from "../constants/index.js";
import {
  accountIdSchema,
  createLimitSchema,
  targetingSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../utils/tool-responses.js";

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
      limit: createLimitSchema("results"),
      user_id: userIdSchema,
    },
    async ({ type, query, limit, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.searchTargeting(type, query, limit ?? 25);

        return createSuccessResponse({
          targeting_type: type,
          query,
          results: response.data,
        });
      } catch (error) {
        return createErrorResponse(error);
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
      account_id: accountIdSchema,
      targeting: targetingSchema.describe(
        "Targeting specification object (geo_locations, interests, age_min, age_max, etc.)",
      ),
      user_id: userIdSchema,
    },
    async ({ account_id, targeting, user_id }) => {
      try {
        const normalizedId = normalizeAccountId(account_id);
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getReachEstimate(normalizedId, targeting);

        return createSuccessResponse({
          reach_estimate: response.data,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );
}
