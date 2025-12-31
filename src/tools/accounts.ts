/**
 * Ad Account Tools
 *
 * MCP tools for managing Meta ad accounts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMetaClient } from "../api/meta-client.js";
import {
  accountIdSchema,
  createLimitSchema,
  userIdSchema,
} from "../schemas/index.js";
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
      limit: createLimitSchema("accounts"),
      user_id: userIdSchema,
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
      account_id: accountIdSchema,
      user_id: userIdSchema,
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
