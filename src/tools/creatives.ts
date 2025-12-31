/**
 * Creative Tools
 *
 * MCP tools for managing Meta ad creatives.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";

export function registerCreativeTools(server: McpServer): void {
  /**
   * List ad creatives for an ad account
   */
  server.tool(
    "get_ad_creatives",
    "List ad creatives for an ad account",
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
        .describe("Maximum number of creatives to return (default: 25)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ account_id, limit, user_id }) => {
      try {
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getAdCreatives(normalizedId, limit ?? 25);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  creatives: response.data,
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
   * Create a new ad creative
   */
  server.tool(
    "create_ad_creative",
    "Create a new ad creative for use in ads",
    {
      account_id: z
        .string()
        .describe("Ad account ID (with or without 'act_' prefix)"),
      name: z.string().min(1).describe("Creative name"),
      object_story_spec: z
        .record(z.unknown())
        .describe(
          "Object story specification defining the creative content (page_id, link_data, etc.)",
        ),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ account_id, name, object_story_spec, user_id }) => {
      try {
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

        const client = createMetaClient({ userId: user_id ?? "default" });

        const result = await client.createAdCreative(normalizedId, {
          name,
          object_story_spec,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  creative_id: result.id,
                  message: `Creative "${name}" created successfully`,
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
