/**
 * Minimal OAuth Callback Server for Meta Ads MCP
 *
 * This server handles the OAuth callback from Facebook and exchanges
 * the authorization code for an access token.
 *
 * Deploy this on a server accessible at meta.realnewspr.com
 */

const META_APP_ID = process.env["META_APP_ID"] ?? "";
const META_APP_SECRET = process.env["META_APP_SECRET"] ?? "";
const META_API_VERSION = process.env["META_API_VERSION"] ?? "v22.0";
const CALLBACK_URL = process.env["CALLBACK_URL"] ?? "https://meta.realnewspr.com/callback";
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

// Simple in-memory state store (for production, use Redis or database)
const pendingStates = new Map<string, { userId: string; createdAt: number }>();

// Token store (for production, use SQLite or database)
const tokens = new Map<string, {
  accessToken: string;
  expiresAt: number | null;
  scopes: string[];
}>();

async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in?: number;
}> {
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    redirect_uri: CALLBACK_URL,
    code,
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${params.toString()}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token exchange failed: ${JSON.stringify(error)}`);
  }

  return response.json();
}

async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in?: number;
}> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${params.toString()}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Long-lived token exchange failed: ${JSON.stringify(error)}`);
  }

  return response.json();
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // OAuth callback
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorReason = url.searchParams.get("error_reason");
      const errorDescription = url.searchParams.get("error_description");

      // Handle OAuth errors
      if (error) {
        return new Response(
          `
          <!DOCTYPE html>
          <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #e74c3c;">Authentication Failed</h1>
            <p><strong>Error:</strong> ${error}</p>
            <p><strong>Reason:</strong> ${errorReason || "Unknown"}</p>
            <p><strong>Description:</strong> ${errorDescription || "No description provided"}</p>
            <p>Please close this window and try again.</p>
          </body>
          </html>
          `,
          { headers: { "Content-Type": "text/html" }, status: 400 }
        );
      }

      if (!code || !state) {
        return new Response("Missing code or state parameter", { status: 400 });
      }

      // Verify state
      const stateData = pendingStates.get(state);
      if (!stateData) {
        return new Response("Invalid or expired state parameter", { status: 400 });
      }

      // Check state age (max 10 minutes)
      if (Date.now() - stateData.createdAt > 10 * 60 * 1000) {
        pendingStates.delete(state);
        return new Response("State parameter expired", { status: 400 });
      }

      try {
        // Exchange code for short-lived token
        const shortLivedToken = await exchangeCodeForToken(code);

        // Exchange for long-lived token
        let finalToken = shortLivedToken;
        if (META_APP_SECRET) {
          try {
            finalToken = await exchangeForLongLivedToken(shortLivedToken.access_token);
          } catch (e) {
            console.error("Failed to exchange for long-lived token:", e);
            // Continue with short-lived token
          }
        }

        // Store token
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = finalToken.expires_in ? now + finalToken.expires_in : null;

        tokens.set(stateData.userId, {
          accessToken: finalToken.access_token,
          expiresAt,
          scopes: ["ads_management", "ads_read", "business_management"],
        });

        // Clean up state
        pendingStates.delete(state);

        const expiresInfo = expiresAt
          ? `Token expires: ${new Date(expiresAt * 1000).toISOString()}`
          : "Token never expires (system user)";

        return new Response(
          `
          <!DOCTYPE html>
          <html>
          <head><title>Authentication Successful</title></head>
          <body style="font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #27ae60;">Authentication Successful!</h1>
            <p>You have successfully authenticated with Meta Ads.</p>
            <p><strong>User ID:</strong> ${stateData.userId}</p>
            <p><strong>${expiresInfo}</strong></p>
            <p>You can now close this window and return to Claude.</p>
            <script>
              // Attempt to close the window after a short delay
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
          </html>
          `,
          { headers: { "Content-Type": "text/html" } }
        );
      } catch (e) {
        console.error("OAuth callback error:", e);
        return new Response(
          `
          <!DOCTYPE html>
          <html>
          <head><title>Authentication Error</title></head>
          <body style="font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #e74c3c;">Authentication Error</h1>
            <p>An error occurred during authentication:</p>
            <pre style="background: #f8f9fa; padding: 10px; overflow-x: auto;">${e instanceof Error ? e.message : String(e)}</pre>
            <p>Please close this window and try again.</p>
          </body>
          </html>
          `,
          { headers: { "Content-Type": "text/html" }, status: 500 }
        );
      }
    }

    // Generate auth URL (called by MCP server or for testing)
    if (url.pathname === "/auth/start") {
      const userId = url.searchParams.get("user_id") ?? "default";

      // Generate state
      const stateBytes = new Uint8Array(32);
      crypto.getRandomValues(stateBytes);
      const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, "0")).join("");

      // Store state
      pendingStates.set(state, { userId, createdAt: Date.now() });

      const scopes = ["ads_management", "ads_read", "business_management", "pages_read_engagement", "pages_show_list"];
      const params = new URLSearchParams({
        client_id: META_APP_ID,
        redirect_uri: CALLBACK_URL,
        state,
        scope: scopes.join(","),
        response_type: "code",
      });

      const authUrl = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;

      return new Response(JSON.stringify({ auth_url: authUrl, state }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check token status
    if (url.pathname === "/auth/status") {
      const userId = url.searchParams.get("user_id") ?? "default";
      const token = tokens.get(userId);

      if (!token) {
        return new Response(JSON.stringify({ authenticated: false }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Check expiration
      if (token.expiresAt && Date.now() / 1000 > token.expiresAt) {
        tokens.delete(userId);
        return new Response(JSON.stringify({ authenticated: false, reason: "expired" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          authenticated: true,
          expires_at: token.expiresAt,
          scopes: token.scopes,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Get token (internal API - should be protected in production)
    if (url.pathname === "/auth/token") {
      const userId = url.searchParams.get("user_id") ?? "default";
      const token = tokens.get(userId);

      if (!token) {
        return new Response(JSON.stringify({ error: "not_authenticated" }), {
          headers: { "Content-Type": "application/json" },
          status: 401,
        });
      }

      return new Response(
        JSON.stringify({
          access_token: token.accessToken,
          expires_at: token.expiresAt,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`OAuth callback server running on port ${PORT}`);
console.log(`Callback URL: ${CALLBACK_URL}`);
console.log(`App ID: ${META_APP_ID ? META_APP_ID.slice(0, 6) + "..." : "NOT SET"}`);
console.log(`App Secret: ${META_APP_SECRET ? "***configured***" : "NOT SET"}`);
