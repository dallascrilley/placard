import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDefaultMetaAuth } from "../api/auth.js";
import {
  CREATE_ANNOTATIONS,
  LOGOUT_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
} from "../constants/index.js";

export function registerAuthTools(server: McpServer): void {
  const auth = getDefaultMetaAuth();

  // Get login link for OAuth flow
  server.tool(
    "meta_get_login_link",
    `Get a login link for Meta Ads OAuth authentication.

Initiates the OAuth 2.0 authentication flow for Meta Marketing API access. Returns a login URL that users must visit to grant permissions. If already authenticated, returns current authentication status instead.

Args:
  - user_id (string, optional): User identifier for token storage. Defaults to 'default' for single-user setups.

Returns:
  If authenticated:
  {
    "status": "already_authenticated",
    "message": "You are already authenticated with Meta Ads.",
    "user_id": "default",
    "expires_at": 1234567890,
    "expires_info": "Expires: 2025-01-01T00:00:00.000Z",
    "scopes": ["ads_read", "ads_management"]
  }
  
  If not authenticated:
  {
    "status": "authentication_required",
    "message": "Click the link below to authenticate with Meta Ads.",
    "login_url": "https://www.facebook.com/v22.0/dialog/oauth?...",
    "markdown_link": "[Authenticate with Meta Ads](https://...)",
    "state": "random_state_string",
    "user_id": "default",
    "callback_url": "https://example.com/callback",
    "scopes_requested": ["ads_read", "ads_management"],
    "token_duration": "60 days",
    "instructions": ["1. Click the login link above", ...]
  }

Examples:
  - Default user: { "user_id": "default" }
  - Multi-user: { "user_id": "user_123" }

Errors:
  - No API errors - returns status information only`,
    {
      user_id: z
        .string()
        .optional()
        .describe("User identifier for token storage. Defaults to 'default'."),
    },
    READ_ONLY_ANNOTATIONS,
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
    "meta_check_auth_status",
    `Check the current Meta Ads authentication status.

Verifies whether a user is authenticated and returns token expiration information, scopes, and validity status. Use this to check authentication before making API calls.

Args:
  - user_id (string, optional): User identifier to check. Defaults to 'default'.

Returns:
  If authenticated:
  {
    "status": "authenticated",
    "message": "Successfully authenticated with Meta Ads.",
    "user_id": "default",
    "is_valid": true,
    "scopes": ["ads_read", "ads_management"],
    "expires_at": 1234567890,
    "expires_at_iso": "2025-01-01T00:00:00.000Z",
    "expires_in_days": 45
  }
  
  If not authenticated:
  {
    "status": "not_authenticated",
    "message": "Not authenticated. Use get_login_link to start OAuth flow.",
    "user_id": "default"
  }

Examples:
  - Check default user: { "user_id": "default" }
  - Check specific user: { "user_id": "user_123" }

Errors:
  - No API errors - returns status information only`,
    {
      user_id: z
        .string()
        .optional()
        .describe("User identifier to check. Defaults to 'default'."),
    },
    READ_ONLY_ANNOTATIONS,
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
    "meta_logout",
    `Logout and revoke the Meta Ads access token.

Removes the stored access token for a user and optionally revokes it with Meta's API. After logout, the user must re-authenticate using get_login_link.

Args:
  - user_id (string, optional): User identifier to logout. Defaults to 'default'.

Returns:
  If logout successful:
  {
    "status": "logged_out",
    "message": "Successfully logged out and revoked token.",
    "user_id": "default"
  }
  
  If no session found:
  {
    "status": "not_found",
    "message": "No active session found for this user.",
    "user_id": "default"
  }

Examples:
  - Logout default user: { "user_id": "default" }
  - Logout specific user: { "user_id": "user_123" }

Errors:
  - No API errors - returns status information only`,
    {
      user_id: z
        .string()
        .optional()
        .describe("User identifier to logout. Defaults to 'default'."),
    },
    LOGOUT_ANNOTATIONS,
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

  // Complete authentication with authorization code
  server.tool(
    "meta_complete_auth",
    `Complete Meta Ads authentication using an authorization code.

Use this tool when you have an authorization code from the OAuth callback URL. This is useful when the state parameter expired (e.g., after server restart) but you still have a valid authorization code.

Args:
  - code (string, required): The authorization code from the callback URL (the 'code' query parameter).
  - user_id (string, optional): User identifier for token storage. Defaults to 'default'.

Returns:
  If successful:
  {
    "status": "authenticated",
    "message": "Successfully authenticated with Meta Ads.",
    "user_id": "default",
    "expires_at": 1234567890,
    "expires_at_iso": "2025-03-01T00:00:00.000Z",
    "expires_in_days": 60,
    "scopes": ["ads_read", "ads_management", ...]
  }

  If failed:
  {
    "status": "error",
    "message": "Token exchange failed: ...",
    "user_id": "default"
  }

Examples:
  - { "code": "AQCPd9WAO72OrMnxjwABOBgn33iWmw4QXxhU5VEva3Gshy..." }
  - { "code": "AQCPd9...", "user_id": "user_123" }

Errors:
  - Token exchange failed: Invalid or expired authorization code
  - Token exchange failed: Code has already been used`,
    {
      code: z
        .string()
        .describe("The authorization code from the OAuth callback URL."),
      user_id: z
        .string()
        .optional()
        .describe("User identifier for token storage. Defaults to 'default'."),
    },
    CREATE_ANNOTATIONS,
    async ({ code, user_id }) => {
      const userId = user_id ?? "default";

      try {
        const token = await auth.exchangeCodeDirect(code, userId);

        const expiresInfo = token.expiresAt
          ? {
              expires_at: token.expiresAt,
              expires_at_iso: new Date(token.expiresAt * 1000).toISOString(),
              expires_in_days: Math.floor(
                (token.expiresAt * 1000 - Date.now()) / (1000 * 60 * 60 * 24),
              ),
            }
          : {
              expires_at: null,
              expires_info: "Never expires",
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
                  ...expiresInfo,
                  scopes: token.scopes,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  message: errorMessage,
                  user_id: userId,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
