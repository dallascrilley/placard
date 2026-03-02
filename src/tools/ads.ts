/**
 * Ad Tools
 *
 * MCP tools for managing Meta ads.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
import { compareEntities } from "../utils/entity-compare.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import {
  createErrorResponse,
  createSuccessResponse,
  enhancePagination,
} from "../utils/tool-responses.js";

const DEFAULT_AD_COMPARE_IGNORE_FIELDS = [
  "id",
  "adset_id",
  "campaign_id",
  "created_time",
  "updated_time",
  "effective_status",
  "creative.id",
];

function hasObjectStorySpec(
  creative: Record<string, unknown> | undefined,
): creative is Record<string, unknown> & { object_story_spec: object } {
  if (!creative) return false;
  const spec = creative["object_story_spec"];
  return typeof spec === "object" && spec !== null && !Array.isArray(spec);
}

function buildFallbackCreativeName(sourceAdName: string): string {
  // Keep fallback names unique enough to avoid destination creative-name collisions.
  const suffix = new Date().toISOString().replace(/[:.]/g, "-");
  return `${sourceAdName} (Copy Creative ${suffix})`;
}

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
    withToolHandler(
      async (
        { account_id, limit, after, before, fields, adset_id, campaign_id },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
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
    withToolHandler(async ({ ad_id, fields }, { client, format }) => {
      const ad = await client.getAdDetails(ad_id, fields);

      return createSuccessResponse({ ad }, format);
    }),
  );

  /**
   * Duplicate an ad into a target ad set
   */
  server.tool(
    "meta_duplicate_ad",
    `Duplicate an ad into a target ad set.

Copies ad configuration from a source ad and creates a new ad in the destination account/ad set. The tool clones the source creative into the destination account first, then creates the new ad using that cloned creative to support cross-account duplication safely.

Args:
  - source_ad_id (string, required): Ad ID to copy from
  - target_account_id (string, required): Destination ad account ID (with or without 'act_' prefix)
  - target_adset_id (string, required): Destination ad set ID for new ad
  - name (string, optional): Name for duplicated ad (default: source name + " (Copy)")
  - status (string, optional): Initial status for duplicated ad - ACTIVE or PAUSED (default: PAUSED)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "ad_id": "999888777",
    "source_ad_id": "123456789",
    "target_adset_id": "987654321",
    "creative_id": "111222333",
    "message": "Ad duplicated successfully"
  }`,
    {
      source_ad_id: z.string().describe("Ad ID to duplicate"),
      target_account_id: accountIdSchema,
      target_adset_id: z.string().describe("Destination ad set ID"),
      name: z.string().min(1).optional().describe("Name for duplicated ad"),
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .describe("Initial status for duplicated ad (default: PAUSED)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async (
        { source_ad_id, target_account_id, target_adset_id, name, status },
        { client, format },
      ) => {
        const sourceAd = await client.getAdDetails(source_ad_id, [
          "id",
          "name",
          "creative{id,name,object_story_spec}",
        ]);
        const sourceCreative = sourceAd.creative as
          | Record<string, unknown>
          | undefined;
        const creativeId =
          typeof sourceCreative?.["id"] === "string"
            ? (sourceCreative["id"] as string)
            : undefined;

        if (!creativeId) {
          return createErrorResponse(
            new Error(
              "Source ad is missing creative.id; cannot duplicate without a creative reference",
            ),
            format,
          );
        }

        const normalizedTargetId = normalizeAccountId(target_account_id);
        if (!hasObjectStorySpec(sourceCreative)) {
          return createErrorResponse(
            new Error(
              `Source creative ${creativeId} does not include object_story_spec, so it cannot be cloned into destination account ${normalizedTargetId}.`,
            ),
            format,
          );
        }

        const clonedCreative = await client.createAdCreative(
          normalizedTargetId,
          {
            name: (typeof sourceCreative["name"] === "string" &&
            sourceCreative["name"].trim().length > 0
              ? sourceCreative["name"]
              : buildFallbackCreativeName(sourceAd.name)) as string,
            object_story_spec: sourceCreative.object_story_spec,
          },
        );

        const result = await client.createAd(normalizedTargetId, {
          name: name ?? `${sourceAd.name} (Copy)`,
          adset_id: target_adset_id,
          creative: { creative_id: clonedCreative.id },
          status: status ?? "PAUSED",
        });

        return createSuccessResponse(
          {
            ad_id: result.id,
            source_ad_id,
            target_adset_id,
            target_account_id: normalizedTargetId,
            source_creative_id: creativeId,
            creative_id: clonedCreative.id,
            message: "Ad duplicated successfully",
          },
          format,
        );
      },
    ),
  );

  /**
   * Compare two ads and return field-level differences
   */
  server.tool(
    "meta_compare_ads",
    `Compare two ads and return field-level differences.

Fetches both ads, normalizes nested values, and reports exact field differences. Useful for validating generated ads against reference ads.

Args:
  - source_ad_id (string, required): Reference ad ID
  - target_ad_id (string, required): Ad ID to compare against reference
  - ignore_fields (array[string], optional): Additional field paths to ignore
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "match": false,
    "source_ad_id": "123",
    "target_ad_id": "456",
    "summary": {
      "total_compared_fields": 15,
      "matched_fields": 12,
      "different_fields": 3,
      "missing_in_source": 0,
      "missing_in_target": 0
    },
    "differences": []
  }`,
    {
      source_ad_id: z.string().describe("Reference ad ID"),
      target_ad_id: z.string().describe("Ad ID to compare"),
      ignore_fields: z
        .array(z.string().min(1))
        .optional()
        .describe("Additional field paths to ignore in comparison"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { source_ad_id, target_ad_id, ignore_fields },
        { client, format },
      ) => {
        const [sourceAd, targetAd] = await Promise.all([
          client.getAdDetails(source_ad_id),
          client.getAdDetails(target_ad_id),
        ]);

        const compareResult = compareEntities(
          sourceAd as unknown as Record<string, unknown>,
          targetAd as unknown as Record<string, unknown>,
          {
            ignoreFields: [
              ...DEFAULT_AD_COMPARE_IGNORE_FIELDS,
              ...(ignore_fields ?? []),
            ],
          },
        );

        return createSuccessResponse(
          {
            source_ad_id,
            target_ad_id,
            ...compareResult,
          },
          format,
        );
      },
    ),
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
  - creative (object, optional): Inline creative specification. Supported inline path is object_story_spec-based creative only (required if creative_id not provided). For dynamic creative via asset_feed_spec, create the creative first with meta_create_ad_creative and then pass creative_id here.
  - tracking_specs (array, optional): Tracking specifications for conversion tracking. Each spec is an object with action.type and pixel ID. Example: [{"action.type": ["offsite_conversion"], "fb_pixel": ["466195414027782"]}]
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
  - With inline object_story_spec creative: { "account_id": "act_123", "name": "New Ad", "adset_id": "987", "creative": { "object_story_spec": { "page_id": "123456", "link_data": { "message": "Check out our sale!", "link": "https://example.com" } } } }
  - Dynamic creative flow: 1) call meta_create_ad_creative with asset_feed_spec, 2) call meta_create_ad with returned creative_id

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
      tracking_specs: z
        .array(z.record(z.unknown()))
        .optional()
        .describe(
          'Tracking specs for conversion tracking, e.g. [{"action.type": ["offsite_conversion"], "fb_pixel": ["466195414027782"]}]',
        ),
      status: z
        .enum(["ACTIVE", "PAUSED"])
        .optional()
        .describe("Initial ad status (default: PAUSED)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async (
        {
          account_id,
          name,
          adset_id,
          creative_id,
          creative,
          tracking_specs,
          status,
        },
        { client, format },
      ) => {
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

        const result = await client.createAd(normalizedId, {
          name,
          adset_id,
          creative: creativeSpec,
          status: status ?? "PAUSED",
          ...(tracking_specs ? { tracking_specs } : {}),
        });

        return createSuccessResponse(
          {
            ad_id: result.id,
            message: `Ad "${name}" created successfully`,
          },
          format,
        );
      },
    ),
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
    withToolHandler(async ({ ad_id, name, status }, { client, format }) => {
      await client.updateAd(ad_id, { name, status });

      return createSuccessResponse(
        {
          message: `Ad ${ad_id} updated successfully`,
        },
        format,
      );
    }),
  );

  /**
   * Soft-delete an ad
   */
  server.tool(
    "meta_delete_ad",
    `Soft-delete an ad by setting its status to DELETED.

Convenience wrapper for meta_update_ad with status: DELETED. Ads are not permanently removed; they can be filtered out of lists.

Args:
  - ad_id (string, required): Ad ID to delete
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "message": "Ad 123456789 deleted successfully"
  }

Examples:
  - Delete ad: { "ad_id": "123456789" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied
  - 100: Invalid ad ID`,
    {
      ad_id: z.string().describe("Ad ID to delete"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    UPDATE_ANNOTATIONS,
    withToolHandler(async ({ ad_id }, { client, format }) => {
      await client.updateAd(ad_id, { status: "DELETED" });
      return createSuccessResponse(
        { message: `Ad ${ad_id} deleted successfully` },
        format,
      );
    }),
  );
}
