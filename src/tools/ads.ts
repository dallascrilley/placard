/**
 * Ad Tools
 *
 * MCP tools for managing Meta ads.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";
import {
  AD_STATUSES,
  CREATE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  UPDATE_ANNOTATIONS,
} from "../constants/index.js";
import {
  accountIdSchema,
  createLimitSchema,
  fieldsSchema,
  paginationCursorSchema,
  responseFormatSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import {
  createErrorResponse,
  createSuccessResponse,
  enhancePagination,
} from "../utils/tool-responses.js";

export function registerAdTools(server: McpServer): void {
  /**
   * List ads for an ad account
   */
  server.tool(
    "meta_get_ads",
    `List ads for an ad account with optional filtering.

Retrieves ads from a Meta ad account, with optional filtering by ad set ID or campaign ID. Returns ad details including creative information, status, and performance data. Supports pagination for large result sets.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - limit (number, optional): Maximum ads to return, 1-100 (default: 25)
  - after (string, optional): Pagination cursor to fetch the next page
  - before (string, optional): Pagination cursor to fetch the previous page
  - fields (array[string], optional): Specific ad fields to return
  - adset_id (string, optional): Filter by ad set ID to get ads for a specific ad set
  - campaign_id (string, optional): Filter by campaign ID to get ads for a specific campaign
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "ads": [
      {
        "id": "123456789",
        "name": "Ad 1",
        "adset_id": "987654321",
        "creative": { "id": "111222333" },
        "status": "ACTIVE"
      }
    ],
    "paging": {
      "cursors": {
        "before": "...",
        "after": "..."
      },
      "next": "https://graph.facebook.com/v22.0/act_123/ads?..."
    }
  }

Examples:
  - All ads: { "account_id": "act_123" }
  - Filter by ad set: { "account_id": "act_123", "adset_id": "987654321" }
  - Filter by campaign: { "account_id": "act_123", "campaign_id": "123456789" }
  - Minimal fields: { "account_id": "act_123", "fields": ["id", "name", "creative"] }
  - Next page: { "account_id": "act_123", "after": "QVFI..." }
  - With limit: { "account_id": "act_123", "limit": 50 }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to account`,
    {
      account_id: accountIdSchema,
      limit: createLimitSchema("ads"),
      after: paginationCursorSchema,
      before: paginationCursorSchema,
      fields: fieldsSchema,
      adset_id: z.string().optional().describe("Filter by ad set ID"),
      campaign_id: z.string().optional().describe("Filter by campaign ID"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    async ({
      account_id,
      limit,
      after,
      before,
      fields,
      adset_id,
      campaign_id,
      user_id,
      response_format,
    }) => {
      const format = response_format ?? "json";
      try {
        const normalizedId = normalizeAccountId(account_id);
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getAds(normalizedId, {
          limit: limit ?? 25,
          after,
          before,
          fields,
          adset_id,
          campaign_id,
        });

        return createSuccessResponse(
          {
            ads: response.data,
            paging: enhancePagination(response.paging, response.data),
          },
          format,
        );
      } catch (error) {
        return createErrorResponse(error, format);
      }
    },
  );

  /**
   * Get detailed information about a specific ad
   */
  server.tool(
    "meta_get_ad_details",
    `Get detailed information about a specific ad.

Retrieves comprehensive details about a single ad including creative content, status, associated ad set, and configuration. Useful for inspecting ad settings before updates or troubleshooting.

Args:
  - ad_id (string, required): Ad ID
  - fields (array[string], optional): Specific ad fields to return
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "ad": {
      "id": "123456789",
      "name": "Ad 1",
      "adset_id": "987654321",
      "creative": {
        "id": "111222333",
        "name": "Creative 1"
      },
      "status": "ACTIVE",
      "created_time": "2025-01-01T00:00:00+0000",
      "updated_time": "2025-01-15T12:00:00+0000"
    }
  }

Examples:
  - Get ad details: { "ad_id": "123456789" }
  - Minimal fields: { "ad_id": "123456789", "fields": ["id", "name", "creative{id,body}"] }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 100: Invalid ad ID format
  - 10/200/294: Permission denied - user lacks access to this ad`,
    {
      ad_id: z.string().describe("Ad ID"),
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    async ({ ad_id, fields, user_id, response_format }) => {
      const format = response_format ?? "json";
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const ad = await client.getAdDetails(ad_id, fields);

        return createSuccessResponse({ ad }, format);
      } catch (error) {
        return createErrorResponse(error, format);
      }
    },
  );

  /**
   * Create a new ad
   */
  server.tool(
    "meta_create_ad",
    `Create a new ad within an ad set.

Creates a new ad with either an existing creative ID or inline creative specification. Ads are created in PAUSED status by default. Requires either creative_id (for existing creatives) or creative (for inline specification), but not both.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - name (string, required): Ad name (min 1 character)
  - adset_id (string, required): Parent ad set ID
  - creative_id (string, optional): Existing creative ID to use (required if creative not provided)
  - creative (object, optional): Inline creative specification object with object_story_spec, link_data, etc. (required if creative_id not provided)
  - status (string, optional): Initial ad status - ACTIVE or PAUSED (default: PAUSED)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "ad_id": "123456789",
    "message": "Ad \"My Ad\" created successfully"
  }

Examples:
  - With existing creative: { "account_id": "act_123", "name": "Summer Sale Ad", "adset_id": "987", "creative_id": "111222333" }
  - With inline creative: { "account_id": "act_123", "name": "New Ad", "adset_id": "987", "creative": { "object_story_spec": { "page_id": "123456", "link_data": { "message": "Check out our sale!", "link": "https://example.com" } } } }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_management permission
  - 100: Invalid account/adset ID or missing creative_id/creative
  - 1487654: Invalid creative specification
  - 1885503: Creative not found (if creative_id provided)`,
    {
      account_id: accountIdSchema,
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
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    async ({
      account_id,
      name,
      adset_id,
      creative_id,
      creative,
      status,
      user_id,
      response_format,
    }) => {
      const format = response_format ?? "json";
      try {
        const normalizedId = normalizeAccountId(account_id);

        // Build creative object - enforce mutual exclusivity
        let creativeSpec: { creative_id: string } | object;
        if (creative_id && creative) {
          return createErrorResponse(
            "Provide either creative_id or creative specification, not both",
            format,
          );
        }
        if (creative_id) {
          creativeSpec = { creative_id };
        } else if (creative) {
          creativeSpec = creative;
        } else {
          return createErrorResponse(
            "Either creative_id or creative specification is required",
            format,
          );
        }

        const client = createMetaClient({ userId: user_id ?? "default" });

        const result = await client.createAd(normalizedId, {
          name,
          adset_id,
          creative: creativeSpec,
          status: status ?? "PAUSED",
        });

        return createSuccessResponse(
          {
            ad_id: result.id,
            message: `Ad "${name}" created successfully`,
          },
          format,
        );
      } catch (error) {
        return createErrorResponse(error, format);
      }
    },
  );

  /**
   * Update an existing ad
   */
  server.tool(
    "meta_update_ad",
    `Update an existing ad's settings.

Modifies an existing ad's name or status. All parameters are optional - only provided fields will be updated. Note: Creative changes require creating a new ad or updating the creative separately.

Args:
  - ad_id (string, required): Ad ID to update
  - name (string, optional): New ad name (min 1 character)
  - status (string, optional): New ad status - ACTIVE, PAUSED, DELETED, ARCHIVED
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "message": "Ad 123456789 updated successfully"
  }

Examples:
  - Update name: { "ad_id": "123", "name": "Updated Ad Name" }
  - Pause ad: { "ad_id": "123", "status": "PAUSED" }
  - Activate ad: { "ad_id": "123", "status": "ACTIVE" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_management permission
  - 100: Invalid ad ID format`,
    {
      ad_id: z.string().describe("Ad ID to update"),
      name: z.string().min(1).optional().describe("New ad name"),
      status: z.enum(AD_STATUSES).optional().describe("New ad status"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    UPDATE_ANNOTATIONS,
    async ({ ad_id, name, status, user_id, response_format }) => {
      const format = response_format ?? "json";
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });

        const result = await client.updateAd(ad_id, {
          name,
          status,
        });

        return createSuccessResponse(
          {
            message: `Ad ${ad_id} updated successfully`,
          },
          format,
        );
      } catch (error) {
        return createErrorResponse(error, format);
      }
    },
  );
}
