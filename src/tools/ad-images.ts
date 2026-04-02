/**
 * Ad Image Tools
 *
 * MCP tools for uploading ad images to Meta.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CREATE_ANNOTATIONS } from "../constants/index.js";
import {
  accountIdSchema,
  responseFormatSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../utils/tool-responses.js";

export function registerAdImageTools(server: McpServer): void {
  /**
   * Upload an ad image and return its hash for use in creatives
   */
  server.tool(
    "meta_upload_image",
    `Upload an image to an ad account and get its image hash for use in ad creatives.

Reads an image from a local file path or URL, uploads it to Meta's adimages API, and returns the image_hash. For link ads, batch and creative tools map this hash to link_data.picture automatically before Graph create.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - image_path (string, optional): Local file path to the image (e.g. /path/to/banner.png)
  - image_url (string, optional): URL of the image to download and upload
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Exactly one of image_path or image_url is required.

Returns:
  {
    "success": true,
    "image_hash": "abc123def456",
    "filename": "banner.png",
    "message": "Image uploaded successfully. Use image_hash in object_story_spec.link_data.image_hash"
  }

Examples:
  - From file: { "account_id": "act_123", "image_path": "/tmp/banner.png" }
  - From URL: { "account_id": "act_123", "image_url": "https://example.com/image.jpg" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied
  - 100: Invalid image format or parameter`,
    {
      account_id: accountIdSchema,
      image_path: z
        .string()
        .optional()
        .describe("Local file path to the image"),
      image_url: z
        .string()
        .url()
        .optional()
        .describe("URL of the image to download and upload"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async ({ account_id, image_path, image_url }, { client, format }) => {
        if (!image_path && !image_url) {
          return createErrorResponse(
            new Error("Either image_path or image_url is required"),
            format,
          );
        }
        if (image_path && image_url) {
          return createErrorResponse(
            new Error("Provide image_path or image_url, not both"),
            format,
          );
        }

        const normalizedId = normalizeAccountId(account_id);
        const result = await client.uploadAdImage(normalizedId, {
          filePath: image_path,
          url: image_url,
        });

        return createSuccessResponse(
          {
            image_hash: result.image_hash,
            filename: result.filename,
            message:
              "Image uploaded successfully. Store image_hash in your batch config; meta_create_campaign_from_config and meta_create_ad_creative resolve it to link_data.picture automatically for link ads.",
          },
          format,
        );
      },
    ),
  );
}
