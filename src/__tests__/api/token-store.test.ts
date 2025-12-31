import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StoredToken, TokenStore } from "../../api/token-store.js";
import {
  createExpiredToken,
  createNonExpiringToken,
  createSoonExpiringToken,
  createTestToken,
} from "../utils/test-tokens.js";

describe("TokenStore", () => {
  let store: TokenStore;
  let testDbPath: string;
  let testDir: string;

  beforeEach(() => {
    // Create unique temp directory for each test
    testDir = join(
      tmpdir(),
      `token-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, "tokens.db");
    store = new TokenStore(testDbPath);
  });

  afterEach(() => {
    store.close();
    // Clean up test files
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("constructor", () => {
    it("should create database file", () => {
      expect(existsSync(testDbPath)).toBe(true);
    });

    it("should create parent directories if needed", () => {
      const nestedPath = join(testDir, "nested", "deep", "tokens.db");
      const nestedStore = new TokenStore(nestedPath);

      expect(existsSync(nestedPath)).toBe(true);
      nestedStore.close();
    });
  });

  describe("saveToken", () => {
    it("should save a new token", () => {
      const token = createTestToken({ userId: "user-1" });
      store.saveToken(token);

      const retrieved = store.getToken("user-1");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.accessToken).toBe(token.accessToken);
      expect(retrieved?.userId).toBe("user-1");
    });

    it("should update existing token (upsert)", () => {
      const token1 = createTestToken({
        userId: "user-1",
        accessToken: "token-1",
      });
      const token2 = createTestToken({
        userId: "user-1",
        accessToken: "token-2",
      });

      store.saveToken(token1);
      store.saveToken(token2);

      const retrieved = store.getToken("user-1");
      expect(retrieved?.accessToken).toBe("token-2");
    });

    it("should preserve createdAt on update", () => {
      const now = Math.floor(Date.now() / 1000);
      const originalCreatedAt = now - 1000;

      const token1 = createTestToken({
        userId: "user-1",
        createdAt: originalCreatedAt,
        updatedAt: originalCreatedAt,
      });
      const token2 = createTestToken({
        userId: "user-1",
        accessToken: "new-token",
        createdAt: now, // This should be ignored on update
        updatedAt: now,
      });

      store.saveToken(token1);
      store.saveToken(token2);

      const retrieved = store.getToken("user-1");
      // createdAt should be preserved from original insert (not overwritten on conflict)
      expect(retrieved?.createdAt).toBe(originalCreatedAt);
      // updatedAt should reflect the new value
      expect(retrieved?.updatedAt).toBe(now);
      // accessToken should be updated
      expect(retrieved?.accessToken).toBe("new-token");
    });

    it("should store scopes as JSON array", () => {
      const token = createTestToken({
        userId: "user-1",
        scopes: ["ads_read", "ads_management", "pages_read_engagement"],
      });

      store.saveToken(token);

      const retrieved = store.getToken("user-1");
      expect(retrieved?.scopes).toEqual([
        "ads_read",
        "ads_management",
        "pages_read_engagement",
      ]);
    });

    it("should handle null expiresAt", () => {
      const token = createNonExpiringToken({ userId: "user-1" });

      store.saveToken(token);

      const retrieved = store.getToken("user-1");
      expect(retrieved?.expiresAt).toBeNull();
    });
  });

  describe("getToken", () => {
    it("should return null for non-existent user", () => {
      const result = store.getToken("non-existent");
      expect(result).toBeNull();
    });

    it("should return stored token", () => {
      const token = createTestToken({ userId: "user-1" });
      store.saveToken(token);

      const retrieved = store.getToken("user-1");
      expect(retrieved).toEqual(token);
    });
  });

  describe("getValidToken", () => {
    it("should return null for non-existent user", () => {
      const result = store.getValidToken("non-existent");
      expect(result).toBeNull();
    });

    it("should return valid non-expired token", () => {
      const token = createTestToken({ userId: "user-1" });
      store.saveToken(token);

      const retrieved = store.getValidToken("user-1");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.accessToken).toBe(token.accessToken);
    });

    it("should return null for expired token", () => {
      const token = createExpiredToken({ userId: "user-1" });
      store.saveToken(token);

      const retrieved = store.getValidToken("user-1");
      expect(retrieved).toBeNull();
    });

    it("should return null for token expiring within 5-minute buffer", () => {
      const token = createSoonExpiringToken({ userId: "user-1" });
      store.saveToken(token);

      const retrieved = store.getValidToken("user-1");
      expect(retrieved).toBeNull();
    });

    it("should return non-expiring token", () => {
      const token = createNonExpiringToken({ userId: "user-1" });
      store.saveToken(token);

      const retrieved = store.getValidToken("user-1");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.expiresAt).toBeNull();
    });

    it("should return token that expires exactly at 5-minute boundary", () => {
      const now = Math.floor(Date.now() / 1000);
      // Token expires in exactly 5 minutes + 1 second (should be valid)
      const token = createTestToken({
        userId: "user-1",
        expiresAt: now + 5 * 60 + 1,
      });
      store.saveToken(token);

      const retrieved = store.getValidToken("user-1");
      expect(retrieved).not.toBeNull();
    });
  });

  describe("deleteToken", () => {
    it("should return false for non-existent user", () => {
      const result = store.deleteToken("non-existent");
      expect(result).toBe(false);
    });

    it("should delete existing token", () => {
      const token = createTestToken({ userId: "user-1" });
      store.saveToken(token);

      const deleted = store.deleteToken("user-1");
      expect(deleted).toBe(true);

      const retrieved = store.getToken("user-1");
      expect(retrieved).toBeNull();
    });

    it("should only delete specified user's token", () => {
      store.saveToken(createTestToken({ userId: "user-1" }));
      store.saveToken(createTestToken({ userId: "user-2" }));

      store.deleteToken("user-1");

      expect(store.getToken("user-1")).toBeNull();
      expect(store.getToken("user-2")).not.toBeNull();
    });
  });

  describe("listUsers", () => {
    it("should return empty array when no tokens", () => {
      const users = store.listUsers();
      expect(users).toEqual([]);
    });

    it("should return all user IDs", () => {
      store.saveToken(createTestToken({ userId: "user-1" }));
      store.saveToken(createTestToken({ userId: "user-2" }));
      store.saveToken(createTestToken({ userId: "user-3" }));

      const users = store.listUsers();
      expect(users).toHaveLength(3);
      expect(users).toContain("user-1");
      expect(users).toContain("user-2");
      expect(users).toContain("user-3");
    });

    it("should not return duplicate user IDs", () => {
      store.saveToken(
        createTestToken({ userId: "user-1", accessToken: "token-1" }),
      );
      store.saveToken(
        createTestToken({ userId: "user-1", accessToken: "token-2" }),
      );

      const users = store.listUsers();
      expect(users).toEqual(["user-1"]);
    });
  });

  describe("multi-user isolation", () => {
    it("should isolate tokens by user_id", () => {
      const token1 = createTestToken({
        userId: "user-1",
        accessToken: "token-for-user-1",
      });
      const token2 = createTestToken({
        userId: "user-2",
        accessToken: "token-for-user-2",
      });

      store.saveToken(token1);
      store.saveToken(token2);

      expect(store.getToken("user-1")?.accessToken).toBe("token-for-user-1");
      expect(store.getToken("user-2")?.accessToken).toBe("token-for-user-2");
    });

    it("should handle 'default' user ID", () => {
      const token = createTestToken({ userId: "default" });
      store.saveToken(token);

      const retrieved = store.getToken("default");
      expect(retrieved?.userId).toBe("default");
    });
  });

  describe("close", () => {
    it("should close database connection", () => {
      store.close();

      // Attempting to use closed store should throw
      expect(() => store.listUsers()).toThrow();
    });
  });
});
