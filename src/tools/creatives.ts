/**
 * Creative Tools
 *
 * MCP tools for managing Meta ad creatives.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
import { withToolHandler } from "../utils/tool-handler.js";
import {
  createErrorResponse,
  createSuccessResponse,
  enhancePagination,
} from "../utils/tool-responses.js";

export function validateCreativeSpecInputs(
  object_story_spec: Record<string, unknown> | undefined,
  asset_feed_spec: Record<string, unknown> | undefined,
): string | null {
  const hasObjectStorySpec = object_story_spec !== undefined;
  const hasAssetFeedSpec = asset_feed_spec !== undefined;

  if (!hasObjectStorySpec && !hasAssetFeedSpec) {
    return "Provide one creative specification: object_story_spec or asset_feed_spec.";
  }
  if (hasObjectStorySpec && hasAssetFeedSpec) {
    return "Provide either object_story_spec or asset_feed_spec, not both.";
  }

  return null;
}

export function validateCreativeCallToAction(
  object_story_spec: Record<string, unknown> | undefined,
): string | null {
  if (!object_story_spec) {
    return null;
  }

  const extractCtaType = (
    sectionName: "link_data" | "video_data",
  ): string | undefined => {
    const section = object_story_spec[sectionName] as
      | Record<string, unknown>
      | undefined;
    const callToAction = section?.["call_to_action"] as
      | Record<string, unknown>
      | undefined;
    return typeof callToAction?.["type"] === "string"
      ? (callToAction["type"] as string)
      : undefined;
  };

  const linkCta = extractCtaType("link_data");
  const videoCta = extractCtaType("video_data");
  if (linkCta === "GET_TICKETS" || videoCta === "GET_TICKETS") {
    return "GET_TICKETS is not supported for object_story_spec creatives. Use BUY_TICKETS instead.";
  }

  return null;
}

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
    withToolHandler(
      async (
        { account_id, campaign_id, limit, after, before, fields },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
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
      },
    ),
  );

  /**
   * Create a new ad creative
   */
  server.tool(
    "meta_create_ad_creative",
    `Create a new ad creative for use in ads.

Creates a reusable ad creative that can be used across multiple ads. Provide exactly one creative spec: object_story_spec (standard creative) or asset_feed_spec (dynamic creative). Note: If the Meta app is in development mode, creative creation will fail (error 1885183). Campaigns and ad sets can be created.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - name (string, required): Creative name (min 1 character)
  - object_story_spec (object, optional): Standard creative specification with page_id and link_data/video_data/photo_data. Mutually exclusive with asset_feed_spec.
  - asset_feed_spec (object, optional): Dynamic creative asset feed spec (texts/images/CTAs variants). Mutually exclusive with object_story_spec.
  - url_tags (string, optional): URL tracking tags appended to outbound links (for example: "utm_source=facebook&utm_campaign=spring_sale")
  - instagram_actor_id (string, optional): Instagram actor ID for Instagram placements
  - degrees_of_freedom_spec (object, optional): Advanced Meta creative optimization controls
  - applink_treatment (string, optional): App link handling mode for destination behavior
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "creative_id": "123456789",
    "message": "Creative \"My Creative\" created successfully"
  }

Examples:
  - Link ad creative: { "account_id": "act_123", "name": "Sale Banner", "object_story_spec": { "page_id": "987654321", "link_data": { "message": "Summer Sale!", "link": "https://example.com/sale", "image_hash": "abc123" } } }
  - Tickets CTA (supported): use BUY_TICKETS in object_story_spec.link_data.call_to_action.type
  - Video ad creative: { "account_id": "act_123", "name": "Video Ad", "object_story_spec": { "page_id": "987654321", "video_data": { "video_id": "111222333", "message": "Watch our video", "link": "https://example.com" } } }
  - Dynamic creative: { "account_id": "act_123", "name": "DCO Creative", "asset_feed_spec": { "bodies": [{ "text": "Variant A" }, { "text": "Variant B" }], "titles": [{ "text": "Title A" }], "images": [{ "hash": "abc123" }], "link_urls": [{ "website_url": "https://example.com" }], "call_to_action_types": ["LEARN_MORE"] }, "instagram_actor_id": "1784...", "url_tags": "utm_source=facebook&utm_medium=paid_social" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_management permission
  - 100: Invalid account ID or missing required fields
  - 1487654: Invalid object_story_spec format
  - Invalid CTA: GET_TICKETS is not supported in object_story_spec; use BUY_TICKETS
  - 1885504: Page not found or user lacks access to page
  - 1885183: App in development mode - Meta blocks creative creation until app is live. Campaigns and ad sets can be created.`,
    {
      account_id: accountIdSchema,
      name: z.string().min(1).describe("Creative name"),
      object_story_spec: z
        .record(z.unknown())
        .optional()
        .describe(
          "Object story specification defining the creative content (page_id, link_data, etc.)",
        ),
      asset_feed_spec: z
        .record(z.unknown())
        .optional()
        .describe(
          "Dynamic creative asset feed spec (texts/images/CTAs variants)",
        ),
      url_tags: z
        .string()
        .optional()
        .describe("URL tracking tags appended to destination URLs"),
      instagram_actor_id: z
        .string()
        .optional()
        .describe("Instagram actor ID for Instagram placements"),
      degrees_of_freedom_spec: z
        .record(z.unknown())
        .optional()
        .describe("Advanced creative optimization controls"),
      applink_treatment: z
        .string()
        .optional()
        .describe("App link handling mode"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async (
        {
          account_id,
          name,
          object_story_spec,
          asset_feed_spec,
          url_tags,
          instagram_actor_id,
          degrees_of_freedom_spec,
          applink_treatment,
        },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);

        const specErr = validateCreativeSpecInputs(
          object_story_spec,
          asset_feed_spec,
        );
        if (specErr) {
          return createErrorResponse(new Error(specErr), format);
        }

        const ctaErr = validateCreativeCallToAction(object_story_spec);
        if (ctaErr) {
          return createErrorResponse(new Error(ctaErr), format);
        }

        const result = await client.createAdCreative(normalizedId, {
          name,
          object_story_spec,
          asset_feed_spec,
          url_tags,
          instagram_actor_id,
          degrees_of_freedom_spec,
          applink_treatment,
        });

        return createSuccessResponse(
          {
            creative_id: result.id,
            message: `Creative "${name}" created successfully`,
          },
          format,
        );
      },
    ),
  );
}
