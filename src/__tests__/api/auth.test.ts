import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaAuth } from "../../api/auth.js";
import { TokenStore } from "../../api/token-store.js";
import { createMockResponse } from "../utils/mock-fetch.js";
import { createTestToken } from "../utils/test-tokens.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock crypto.getRandomValues for deterministic state generation
const mockRandomValues = vi.fn();
vi.stubGlobal("crypto", {
  getRandomValues: mockRandomValues,
});

describe("MetaAuth", () => {
  let tokenStore: TokenStore;
  let testDir: string;
  let testDbPath: string;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();

    // Setup deterministic random values
    mockRandomValues.mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = i % 256;
      }
      return array;
    });

    // Create test token store
    testDir = join(
      tmpdir(),
      `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, "tokens.db");
    tokenStore = new TokenStore(testDbPath);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    tokenStore.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("constructor", () => {
    it("should use provided config", () => {
      const auth = new MetaAuth(
        {
          appId: "test-app-id",
          appSecret: "test-secret",
          apiVersion: "v21.0",
          callbackUrl: "https://example.com/callback",
          scopes: ["ads_read"],
        },
        tokenStore,
      );

      const config = auth.getConfig();
      expect(config.appId).toBe("test-app-id");
      expect(config.apiVersion).toBe("v21.0");
      expect(config.callbackUrl).toBe("https://example.com/callback");
      expect(config.scopes).toEqual(["ads_read"]);
      expect(config.appSecretConfigured).toBe(true);
    });

    it("should use defaults when config not provided", () => {
      const auth = new MetaAuth({}, tokenStore);
      const config = auth.getConfig();

      expect(config.apiVersion).toBe("v22.0");
      expect(config.scopes).toContain("ads_management");
      expect(config.scopes).toContain("ads_read");
    });
  });

  describe("getAuthUrl", () => {
    it("should generate valid OAuth URL", () => {
      const auth = new MetaAuth(
        {
          appId: "123456",
          callbackUrl: "https://example.com/callback",
          scopes: ["ads_read", "ads_management"],
        },
        tokenStore,
      );

      const { url, state } = auth.getAuthUrl("user-1");

      expect(url).toContain("https://www.facebook.com/");
      expect(url).toContain("dialog/oauth");
      expect(url).toContain("client_id=123456");
      expect(url).toContain(
        "redirect_uri=https%3A%2F%2Fexample.com%2Fcallback",
      );
      expect(url).toContain("scope=ads_read%2Cads_management");
      expect(url).toContain("response_type=code");
      expect(url).toContain(`state=${state}`);
    });

    it("should generate unique state each call", () => {
      // Reset mock to return different values
      let callCount = 0;
      mockRandomValues.mockImplementation((array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = (i + callCount * 100) % 256;
        }
        callCount++;
        return array;
      });

      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      const result1 = auth.getAuthUrl("user-1");
      const result2 = auth.getAuthUrl("user-1");

      expect(result1.state).not.toBe(result2.state);
    });

    it("should store pending state with userId", async () => {
      const auth = new MetaAuth(
        { appId: "123", appSecret: "secret" },
        tokenStore,
      );

      const { state } = auth.getAuthUrl("user-123");

      // State should be valid for exchange
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: {
            access_token: "token",
            token_type: "Bearer",
            expires_in: 3600,
          },
        }),
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: {
            access_token: "long-token",
            token_type: "Bearer",
            expires_in: 5184000,
          },
        }),
      );

      const result = await auth.exchangeCode("code", state);
      expect(result.userId).toBe("user-123");
    });
  });

  describe("exchangeCode", () => {
    it("should throw for invalid state", async () => {
      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      await expect(auth.exchangeCode("code", "invalid-state")).rejects.toThrow(
        "Invalid or expired state parameter",
      );
    });

    it("should throw for expired state", async () => {
      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      const { state } = auth.getAuthUrl("user-1");

      // Advance time past 10 minutes
      vi.advanceTimersByTime(11 * 60 * 1000);

      await expect(auth.exchangeCode("code", state)).rejects.toThrow(
        "State parameter expired",
      );
    });

    it("should exchange code for token", async () => {
      const auth = new MetaAuth(
        { appId: "123", appSecret: "secret" },
        tokenStore,
      );

      const { state } = auth.getAuthUrl("user-1");

      // Mock token exchange responses
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: {
            access_token: "short-token",
            token_type: "Bearer",
            expires_in: 3600,
          },
        }),
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: {
            access_token: "long-token",
            token_type: "Bearer",
            expires_in: 5184000,
          },
        }),
      );

      const result = await auth.exchangeCode("auth-code", state);

      expect(result.accessToken).toBe("long-token");
      expect(result.userId).toBe("user-1");
      expect(result.expiresAt).not.toBeNull();

      // Verify token was stored
      const storedToken = tokenStore.getToken("user-1");
      expect(storedToken?.accessToken).toBe("long-token");
    });

    it("should use short-lived token when no app secret", async () => {
      const auth = new MetaAuth({ appId: "123", appSecret: "" }, tokenStore);

      const { state } = auth.getAuthUrl("user-1");

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: {
            access_token: "short-token",
            token_type: "Bearer",
            expires_in: 3600,
          },
        }),
      );

      const result = await auth.exchangeCode("auth-code", state);

      expect(result.accessToken).toBe("short-token");
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one call (no long-lived exchange)
    });

    it("should handle token without expires_in", async () => {
      const auth = new MetaAuth({ appId: "123", appSecret: "" }, tokenStore);

      const { state } = auth.getAuthUrl("user-1");

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: { access_token: "token", token_type: "Bearer" }, // No expires_in
        }),
      );

      const result = await auth.exchangeCode("auth-code", state);

      expect(result.expiresAt).toBeNull();
    });

    it("should throw on token exchange failure", async () => {
      const auth = new MetaAuth(
        { appId: "123", appSecret: "secret" },
        tokenStore,
      );

      const { state } = auth.getAuthUrl("user-1");

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          status: 400,
          body: { error: { message: "Invalid code" } },
        }),
      );

      await expect(auth.exchangeCode("bad-code", state)).rejects.toThrow(
        "Token exchange failed",
      );
    });

    it("should delete state after use", async () => {
      const auth = new MetaAuth({ appId: "123", appSecret: "" }, tokenStore);

      const { state } = auth.getAuthUrl("user-1");

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: { access_token: "token", token_type: "Bearer" },
        }),
      );

      await auth.exchangeCode("code", state);

      // Second use should fail
      await expect(auth.exchangeCode("code", state)).rejects.toThrow(
        "Invalid or expired state parameter",
      );
    });
  });

  describe("checkAuthStatus", () => {
    it("should return unauthenticated for missing token", async () => {
      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      const status = await auth.checkAuthStatus("non-existent");

      expect(status.isAuthenticated).toBe(false);
      expect(status.expiresAt).toBeNull();
      expect(status.scopes).toEqual([]);
    });

    it("should validate token with Meta API", async () => {
      const auth = new MetaAuth(
        { appId: "123", appSecret: "secret" },
        tokenStore,
      );

      // Store a valid token
      tokenStore.saveToken(createTestToken({ userId: "user-1" }));

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: {
              is_valid: true,
              expires_at: 1735689600,
              scopes: ["ads_read", "ads_management"],
              app_id: "123",
              type: "USER",
              application: "Test App",
              data_access_expires_at: 1735689600,
              user_id: "123",
            },
          },
        }),
      );

      const status = await auth.checkAuthStatus("user-1");

      expect(status.isAuthenticated).toBe(true);
      expect(status.isValid).toBe(true);
      expect(status.scopes).toContain("ads_read");
    });

    it("should fallback to local check if API fails", async () => {
      const auth = new MetaAuth(
        { appId: "123", appSecret: "secret" },
        tokenStore,
      );

      const token = createTestToken({ userId: "user-1" });
      tokenStore.saveToken(token);

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const status = await auth.checkAuthStatus("user-1");

      expect(status.isAuthenticated).toBe(true);
      expect(status.expiresAt).toBe(token.expiresAt);
      expect(status.scopes).toEqual(token.scopes);
    });
  });

  describe("getAccessTokenForUser", () => {
    it("should return null for non-existent user", () => {
      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      const token = auth.getAccessTokenForUser("non-existent");

      expect(token).toBeNull();
    });

    it("should return access token for authenticated user", () => {
      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      tokenStore.saveToken(
        createTestToken({ userId: "user-1", accessToken: "my-token" }),
      );

      const token = auth.getAccessTokenForUser("user-1");

      expect(token).toBe("my-token");
    });

    it("should return null for expired token", () => {
      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      const now = Math.floor(Date.now() / 1000);
      tokenStore.saveToken(
        createTestToken({
          userId: "user-1",
          expiresAt: now - 3600, // Expired
        }),
      );

      const token = auth.getAccessTokenForUser("user-1");

      expect(token).toBeNull();
    });
  });

  describe("logout", () => {
    it("should delete user token", () => {
      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      tokenStore.saveToken(createTestToken({ userId: "user-1" }));

      const result = auth.logout("user-1");

      expect(result).toBe(true);
      expect(tokenStore.getToken("user-1")).toBeNull();
    });

    it("should return false for non-existent user", () => {
      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      const result = auth.logout("non-existent");

      expect(result).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("should return config without exposing secret", () => {
      const auth = new MetaAuth(
        {
          appId: "123",
          appSecret: "super-secret",
          apiVersion: "v21.0",
          callbackUrl: "https://example.com",
          scopes: ["ads_read"],
        },
        tokenStore,
      );

      const config = auth.getConfig();

      expect(config.appId).toBe("123");
      expect(config.appSecretConfigured).toBe(true);
      expect("appSecret" in config).toBe(false);
    });

    it("should indicate when appSecret is not configured", () => {
      const auth = new MetaAuth({ appId: "123", appSecret: "" }, tokenStore);

      const config = auth.getConfig();

      expect(config.appSecretConfigured).toBe(false);
    });
  });

  describe("state cleanup", () => {
    it("should reject expired states", async () => {
      const auth = new MetaAuth({ appId: "123" }, tokenStore);

      // Generate a state
      const { state } = auth.getAuthUrl("user-1");

      // Advance past state expiration (10 minutes)
      vi.advanceTimersByTime(11 * 60 * 1000);

      // Attempting to use expired state should fail
      await expect(auth.exchangeCode("code", state)).rejects.toThrow(
        "State parameter expired",
      );
    });

    it("should reject already-used states", async () => {
      const auth = new MetaAuth({ appId: "123", appSecret: "" }, tokenStore);

      const { state } = auth.getAuthUrl("user-1");

      // Mock successful exchange
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: { access_token: "token", token_type: "Bearer" },
        }),
      );

      // First use succeeds
      await auth.exchangeCode("code", state);

      // Second use should fail (state consumed)
      await expect(auth.exchangeCode("code", state)).rejects.toThrow(
        "Invalid or expired state parameter",
      );
    });
  });

  describe("debugToken", () => {
    it("should call debug_token endpoint", async () => {
      const auth = new MetaAuth(
        { appId: "123", appSecret: "secret", apiVersion: "v22.0" },
        tokenStore,
      );

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: {
              app_id: "123",
              type: "USER",
              application: "Test",
              data_access_expires_at: 1735689600,
              expires_at: 1735689600,
              is_valid: true,
              scopes: ["ads_read"],
              user_id: "456",
            },
          },
        }),
      );

      const result = await auth.debugToken("test-token");

      expect(result.is_valid).toBe(true);
      expect(result.app_id).toBe("123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("debug_token"),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("input_token=test-token"),
      );
    });

    it("should throw on debug failure", async () => {
      const auth = new MetaAuth(
        { appId: "123", appSecret: "secret" },
        tokenStore,
      );

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          status: 400,
          body: { error: { message: "Invalid token" } },
        }),
      );

      await expect(auth.debugToken("bad-token")).rejects.toThrow(
        "Token debug failed",
      );
    });
  });
});
