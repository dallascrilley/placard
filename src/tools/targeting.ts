/**
 * Targeting Tools
 *
 * MCP tools for Meta ad targeting search and reach estimation.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { READ_ONLY_ANNOTATIONS, TARGETING_TYPES } from "../constants/index.js";
import {
  accountIdSchema,
  createLimitSchema,
  responseFormatSchema,
  targetingSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import { createSuccessResponse } from "../utils/tool-responses.js";

export function registerTargetingTools(server: McpServer): void {
  /**
   * Search for targeting options
   */
  server.tool(
    "meta_search_targeting",
    `Search for targeting options by type (interests, locations, demographics, etc.).

Searches Meta's targeting database for interests, locations, demographics, behaviors, and other targeting criteria. Returns matching targeting options with IDs and metadata that can be used in ad set targeting specifications.

Args:
  - type (string, required): Type of targeting to search for. Options: adinterest (interests), adgeolocation (locations), adeducationmajor (education majors), adworkemployer (employers), adworkposition (job titles), adbehaviors (behaviors), adlifeevents (life events), adincome (income ranges), adethnicaffinity (ethnic affinity), adgeneration (generations), adlocale (languages), adradius (radius targeting)
  - query (string, required): Search query string (min 1 character)
  - limit (number, optional): Maximum results to return, 1-100 (default: 25)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "targeting_type": "adinterest",
    "query": "technology",
    "results": [
      {
        "id": "6003107902433",
        "name": "Technology",
        "audience_size": 50000000,
        "path": ["Interests", "Technology"]
      }
    ]
  }

Examples:
  - Search interests: { "type": "adinterest", "query": "technology", "limit": 10 }
  - Search locations: { "type": "adgeolocation", "query": "New York", "limit": 5 }
  - Search behaviors: { "type": "adbehaviors", "query": "frequent travelers" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_read permission
  - 100: Invalid targeting type or query string`,
    {
      type: z
        .enum(TARGETING_TYPES)
        .describe(
          "Type of targeting to search for (e.g., 'adinterest', 'adgeolocation')",
        ),
      query: z.string().min(1).describe("Search query"),
      limit: createLimitSchema("results"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(async ({ type, query, limit }, { client, format }) => {
      const response = await client.searchTargeting(type, query, limit ?? 25);

      return createSuccessResponse(
        {
          targeting_type: type,
          query,
          results: response.data,
        },
        format,
      );
    }),
  );

  /**
   * Get reach estimate for targeting
   */
  server.tool(
    "meta_get_reach_estimate",
    `Get estimated reach for a targeting specification.

Estimates the potential audience size (reach) for a given targeting specification before creating an ad set. Helps validate targeting criteria and understand potential campaign scale. Requires a complete targeting object with geo_locations and other criteria.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - targeting (object, required): Targeting specification object. Must include geo_locations (countries, regions, cities, etc.) and optionally age_min, age_max, genders, interests, behaviors, etc.
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "reach_estimate": {
      "users_lower_bound": 1000000,
      "users_upper_bound": 2000000,
      "estimate_ready": true,
      "bid_estimations": [
        {
          "location": 1,
          "cpa_min": 500,
          "cpa_median": 750,
          "cpa_max": 1000
        }
      ]
    }
  }

Examples:
  - US adults 25-45: { "account_id": "act_123", "targeting": { "age_min": 25, "age_max": 45, "geo_locations": { "countries": ["US"] } } }
  - With interests: { "account_id": "act_123", "targeting": { "geo_locations": { "countries": ["US"] }, "interests": [{ "id": "6003107902433", "name": "Technology" }] } }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to account
  - 100: Invalid account ID or targeting specification
  - 1487654: Invalid targeting format - missing required geo_locations`,
    {
      account_id: accountIdSchema,
      targeting: targetingSchema.describe(
        "Targeting specification object (geo_locations, interests, age_min, age_max, etc.)",
      ),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(async ({ account_id, targeting }, { client, format }) => {
      const normalizedId = normalizeAccountId(account_id);
      const response = await client.getReachEstimate(normalizedId, targeting);

      return createSuccessResponse(
        {
          reach_estimate: response.data,
        },
        format,
      );
    }),
  );
}
