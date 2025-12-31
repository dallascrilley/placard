import {
  type StoredToken,
  type TokenStore,
  getDefaultTokenStore,
} from "./token-store.js";

// Environment configuration
const META_APP_ID = process.env["META_APP_ID"] ?? "";
const META_APP_SECRET = process.env["META_APP_SECRET"] ?? "";
const META_API_VERSION = process.env["META_API_VERSION"] ?? "v22.0";
const META_OAUTH_CALLBACK_URL =
  process.env["META_OAUTH_CALLBACK_URL"] ??
  "https://example.com/callback";

// Required OAuth scopes for ads management
const REQUIRED_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_read_engagement",
  "pages_show_list",
];

export interface OAuthConfig {
  appId: string;
  appSecret: string;
  apiVersion: string;
  callbackUrl: string;
  scopes: string[];
}

export interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface TokenDebugInfo {
  app_id: string;
  type: string;
  application: string;
  data_access_expires_at: number;
  expires_at: number;
  is_valid: boolean;
  scopes: string[];
  user_id: string;
}

export class MetaAuth {
  private config: OAuthConfig;
  private tokenStore: TokenStore;
  private pendingStates: Map<string, { createdAt: number; userId: string }> =
    new Map();

  constructor(config?: Partial<OAuthConfig>, tokenStore?: TokenStore) {
    this.config = {
      appId: config?.appId ?? META_APP_ID,
      appSecret: config?.appSecret ?? META_APP_SECRET,
      apiVersion: config?.apiVersion ?? META_API_VERSION,
      callbackUrl: config?.callbackUrl ?? META_OAUTH_CALLBACK_URL,
      scopes: config?.scopes ?? REQUIRED_SCOPES,
    };

    this.tokenStore = tokenStore ?? getDefaultTokenStore();

    // Clean up old pending states periodically (10 minutes)
    setInterval(() => this.cleanupPendingStates(), 10 * 60 * 1000);
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthUrl(userId: string): { url: string; state: string } {
    const state = this.generateState();

    // Store state for verification
    this.pendingStates.set(state, {
      createdAt: Date.now(),
      userId,
    });

    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.callbackUrl,
      state,
      scope: this.config.scopes.join(","),
      response_type: "code",
    });

    const url = `https://www.facebook.com/${this.config.apiVersion}/dialog/oauth?${params.toString()}`;

    return { url, state };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCode(code: string, state: string): Promise<StoredToken> {
    // Verify state
    const stateData = this.pendingStates.get(state);
    if (!stateData) {
      throw new Error("Invalid or expired state parameter");
    }

    // Remove used state
    this.pendingStates.delete(state);

    // Check state age (max 10 minutes)
    if (Date.now() - stateData.createdAt > 10 * 60 * 1000) {
      throw new Error("State parameter expired");
    }

    // Exchange code for short-lived token
    const shortLivedToken = await this.getAccessToken(code);

    // Exchange for long-lived token if we have app secret
    let finalToken: TokenExchangeResponse;
    if (this.config.appSecret) {
      finalToken = await this.exchangeForLongLivedToken(
        shortLivedToken.access_token,
      );
    } else {
      finalToken = shortLivedToken;
    }

    // Calculate expiration
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = finalToken.expires_in
      ? now + finalToken.expires_in
      : null;

    // Store token
    const storedToken: StoredToken = {
      userId: stateData.userId,
      accessToken: finalToken.access_token,
      tokenType: finalToken.token_type,
      expiresAt,
      scopes: this.config.scopes,
      createdAt: now,
      updatedAt: now,
    };

    this.tokenStore.saveToken(storedToken);

    return storedToken;
  }

  /**
   * Exchange authorization code for access token
   */
  private async getAccessToken(code: string): Promise<TokenExchangeResponse> {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: this.config.callbackUrl,
      code,
    });

    const response = await fetch(
      `https://graph.facebook.com/${this.config.apiVersion}/oauth/access_token?${params.toString()}`,
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token exchange failed: ${JSON.stringify(error)}`);
    }

    return response.json() as Promise<TokenExchangeResponse>;
  }

  /**
   * Exchange short-lived token for long-lived token (60 days)
   */
  private async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<TokenExchangeResponse> {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const response = await fetch(
      `https://graph.facebook.com/${this.config.apiVersion}/oauth/access_token?${params.toString()}`,
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `Long-lived token exchange failed: ${JSON.stringify(error)}`,
      );
    }

    return response.json() as Promise<TokenExchangeResponse>;
  }

  /**
   * Debug/validate an access token
   */
  async debugToken(accessToken: string): Promise<TokenDebugInfo> {
    const params = new URLSearchParams({
      input_token: accessToken,
      access_token: `${this.config.appId}|${this.config.appSecret}`,
    });

    const response = await fetch(
      `https://graph.facebook.com/${this.config.apiVersion}/debug_token?${params.toString()}`,
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token debug failed: ${JSON.stringify(error)}`);
    }

    const result = (await response.json()) as { data: TokenDebugInfo };
    return result.data;
  }

  /**
   * Check if a user has a valid token
   */
  async checkAuthStatus(userId: string): Promise<{
    isAuthenticated: boolean;
    expiresAt: number | null;
    scopes: string[];
    isValid?: boolean;
  }> {
    const token = this.tokenStore.getValidToken(userId);

    if (!token) {
      return {
        isAuthenticated: false,
        expiresAt: null,
        scopes: [],
      };
    }

    // Optionally validate with Meta API
    try {
      const debugInfo = await this.debugToken(token.accessToken);
      return {
        isAuthenticated: debugInfo.is_valid,
        expiresAt: debugInfo.expires_at,
        scopes: debugInfo.scopes,
        isValid: debugInfo.is_valid,
      };
    } catch {
      // If debug fails, rely on local expiration check
      return {
        isAuthenticated: true,
        expiresAt: token.expiresAt,
        scopes: token.scopes,
      };
    }
  }

  /**
   * Get access token for a user
   */
  getAccessTokenForUser(userId: string): string | null {
    const token = this.tokenStore.getValidToken(userId);
    return token?.accessToken ?? null;
  }

  /**
   * Revoke/logout a user
   */
  logout(userId: string): boolean {
    return this.tokenStore.deleteToken(userId);
  }

  /**
   * Generate random state parameter
   */
  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  /**
   * Clean up expired pending states
   */
  private cleanupPendingStates(): void {
    const maxAge = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    for (const [state, data] of this.pendingStates) {
      if (now - data.createdAt > maxAge) {
        this.pendingStates.delete(state);
      }
    }
  }

  /**
   * Get configuration (for debugging)
   */
  getConfig(): Omit<OAuthConfig, "appSecret"> & {
    appSecretConfigured: boolean;
  } {
    return {
      appId: this.config.appId,
      apiVersion: this.config.apiVersion,
      callbackUrl: this.config.callbackUrl,
      scopes: this.config.scopes,
      appSecretConfigured: !!this.config.appSecret,
    };
  }
}

// Default singleton instance
let defaultAuth: MetaAuth | null = null;

export function getDefaultMetaAuth(): MetaAuth {
  if (!defaultAuth) {
    defaultAuth = new MetaAuth();
  }
  return defaultAuth;
}
