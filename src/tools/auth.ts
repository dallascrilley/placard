import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDefaultMetaAuth } from "../api/auth.js";

export function registerAuthTools(server: McpServer): void {
  const auth = getDefaultMetaAuth();

  // Get login link for OAuth flow
  server.tool(
    "get_login_link",
    {
      user_id: z
        .string()
        .optional()
        .describe("User identifier for token storage. Defaults to 'default'."),
    },
    async ({ user_id }) => {
      const userId = user_id ?? "default";

      // Check if already authenticated
      const status = await auth.checkAuthStatus(userId);

      if (status.isAuthenticated) {
        const expiresInfo = status.expiresAt
          ? `Expires: ${new Date(status.expiresAt * 1000).toISOString()}`
          : "Never expires";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "already_authenticated",
                  message: "You are already authenticated with Meta Ads.",
                  user_id: userId,
                  expires_at: status.expiresAt,
                  expires_info: expiresInfo,
                  scopes: status.scopes,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Generate auth URL
      const { url, state } = auth.getAuthUrl(userId);
      const config = auth.getConfig();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "authentication_required",
                message: "Click the link below to authenticate with Meta Ads.",
                login_url: url,
                markdown_link: `[Authenticate with Meta Ads](${url})`,
                state,
                user_id: userId,
                callback_url: config.callbackUrl,
                scopes_requested: config.scopes,
                token_duration: config.appSecretConfigured
                  ? "60 days"
                  : "1-2 hours",
                instructions: [
                  "1. Click the login link above",
                  "2. Log in to Facebook if prompted",
                  "3. Grant permissions to the app",
                  "4. You will be redirected to complete authentication",
                  "5. Use check_auth_status to verify authentication",
                ],
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Check authentication status
  server.tool(
    "check_auth_status",
    {
      user_id: z
        .string()
        .optional()
        .describe("User identifier to check. Defaults to 'default'."),
    },
    async ({ user_id }) => {
      const userId = user_id ?? "default";
      const status = await auth.checkAuthStatus(userId);

      if (!status.isAuthenticated) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "not_authenticated",
                  message:
                    "Not authenticated. Use get_login_link to start OAuth flow.",
                  user_id: userId,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const expiresInfo = status.expiresAt
        ? {
            expires_at: status.expiresAt,
            expires_at_iso: new Date(status.expiresAt * 1000).toISOString(),
            expires_in_days: Math.floor(
              (status.expiresAt * 1000 - Date.now()) / (1000 * 60 * 60 * 24),
            ),
          }
        : {
            expires_at: null,
            expires_info: "Never expires (system user token)",
          };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "authenticated",
                message: "Successfully authenticated with Meta Ads.",
                user_id: userId,
                is_valid: status.isValid ?? true,
                scopes: status.scopes,
                ...expiresInfo,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Logout / revoke token
  server.tool(
    "logout",
    {
      user_id: z
        .string()
        .optional()
        .describe("User identifier to logout. Defaults to 'default'."),
    },
    async ({ user_id }) => {
      const userId = user_id ?? "default";
      const success = auth.logout(userId);

      if (success) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "logged_out",
                  message: "Successfully logged out and revoked token.",
                  user_id: userId,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "not_found",
                message: "No active session found for this user.",
                user_id: userId,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
