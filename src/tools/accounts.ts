/**
 * Ad Account Tools
 *
 * MCP tools for managing Meta ad accounts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../utils/tool-responses.js";

export function registerAccountTools(server: McpServer): void {
  /**
   * List all ad accounts accessible by the authenticated user
   */
  server.tool(
    "get_ad_accounts",
    "List all ad accounts accessible by the authenticated user",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of accounts to return (default: 25)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ limit, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getAdAccounts(limit ?? 25);

        return createSuccessResponse({
          accounts: response.data,
          paging: response.paging,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );

  /**
   * Get detailed information about a specific ad account
   */
  server.tool(
    "get_account_info",
    "Get detailed information about a specific ad account",
    {
      account_id: z
        .string()
        .describe("Ad account ID (with or without 'act_' prefix)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ account_id, user_id }) => {
      try {
        const normalizedId = normalizeAccountId(account_id);
        const client = createMetaClient({ userId: user_id ?? "default" });
        const account = await client.getAccountInfo(normalizedId);

        return createSuccessResponse({ account });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );
}
