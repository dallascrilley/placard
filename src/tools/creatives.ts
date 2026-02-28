/**
 * Creative Tools
 *
 * MCP tools for managing Meta ad creatives.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";
import {
  CREATE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
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

export function registerCreativeTools(server: McpServer): void {
  /**
   * List ad creatives for an ad account
   */
  server.tool(
    "meta_get_ad_creatives",
    `List ad creatives for an ad account.

Retrieves ad creatives (reusable creative assets) from a Meta ad account. Creatives can be used across multiple ads. By default returns a slim field set (id, name, body, thumbnail_url) for token-efficient workflows. Supports pagination for large result sets.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - campaign_id (string, optional): Filter creatives to ads in a specific campaign
  - limit (number, optional): Maximum creatives to return, 1-100 (default: 25)
  - after (string, optional): Pagination cursor to fetch the next page
  - before (string, optional): Pagination cursor to fetch the previous page
  - fields (array[string], optional): Specific creative fields to return (default: id,name,body,thumbnail_url)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "creatives": [
      {
        "id": "123456789",
        "name": "Creative 1",
        "object_story_spec": {
          "page_id": "987654321",
          "link_data": { "message": "Check this out!" }
        }
      }
    ],
    "paging": {
      "total_count": 248,
      "page": { "current": 1, "total": 10 },
      "cursors": {
        "before": "...",
        "after": "..."
      },
      "next": "https://graph.facebook.com/v22.0/act_123/adcreatives?..."
    }
  }

Examples:
  - Get first 25 creatives: { "account_id": "act_123" }
  - Filter by campaign: { "account_id": "act_123", "campaign_id": "123456789" }
  - Get next page: { "account_id": "act_123", "after": "QVFI..." }
  - Minimal fields: { "account_id": "act_123", "fields": ["id", "name", "body"] }
  - Get more: { "account_id": "act_123", "limit": 100 }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to account`,
    {
      account_id: accountIdSchema,
      campaign_id: z.string().optional().describe("Filter by campaign ID"),
      limit: createLimitSchema("creatives"),
      after: paginationCursorSchema,
      before: paginationCursorSchema,
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    async ({
      account_id,
      campaign_id,
      limit,
      after,
      before,
      fields,
      user_id,
      response_format,
    }) => {
      const format = response_format ?? "json";
      try {
        const normalizedId = normalizeAccountId(account_id);
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getAdCreatives(normalizedId, {
          campaign_id,
          limit: limit ?? 25,
          after,
          before,
          fields,
        });

        return createSuccessResponse(
          {
            creatives: response.data,
            paging: enhancePagination(response.paging, response.data, {
              totalCount: response.summary?.total_count,
              limit: limit ?? 25,
              cursorProvided: !!after || !!before,
            }),
          },
          format,
        );
      } catch (error) {
        return createErrorResponse(error, format);
      }
    },
  );

  /**
   * Create a new ad creative
   */
  server.tool(
    "meta_create_ad_creative",
    `Create a new ad creative for use in ads.

Creates a reusable ad creative that can be used across multiple ads. Requires an object_story_spec that defines the creative content including page_id, link_data, image data, or video specifications.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - name (string, required): Creative name (min 1 character)
  - object_story_spec (object, required): Object story specification defining the creative content. Must include page_id and either link_data (for link ads), video_data (for video ads), or photo_data (for photo ads).
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "creative_id": "123456789",
    "message": "Creative \"My Creative\" created successfully"
  }

Examples:
  - Link ad creative: { "account_id": "act_123", "name": "Sale Banner", "object_story_spec": { "page_id": "987654321", "link_data": { "message": "Summer Sale!", "link": "https://example.com/sale", "image_hash": "abc123" } } }
  - Video ad creative: { "account_id": "act_123", "name": "Video Ad", "object_story_spec": { "page_id": "987654321", "video_data": { "video_id": "111222333", "message": "Watch our video", "link": "https://example.com" } } }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_management permission
  - 100: Invalid account ID or missing required fields
  - 1487654: Invalid object_story_spec format
  - 1885504: Page not found or user lacks access to page`,
    {
      account_id: accountIdSchema,
      name: z.string().min(1).describe("Creative name"),
      object_story_spec: z
        .record(z.unknown())
        .describe(
          "Object story specification defining the creative content (page_id, link_data, etc.)",
        ),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    async ({
      account_id,
      name,
      object_story_spec,
      user_id,
      response_format,
    }) => {
      const format = response_format ?? "json";
      try {
        const normalizedId = normalizeAccountId(account_id);
        const client = createMetaClient({ userId: user_id ?? "default" });

        const result = await client.createAdCreative(normalizedId, {
          name,
          object_story_spec,
        });

        return createSuccessResponse(
          {
            creative_id: result.id,
            message: `Creative "${name}" created successfully`,
          },
          format,
        );
      } catch (error) {
        return createErrorResponse(error, format);
      }
    },
  );
}
