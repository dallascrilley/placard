import type { StoredToken } from "../../api/token-store.js";

/**
 * Create a valid test token
 */
export function createTestToken(
  overrides: Partial<StoredToken> = {},
): StoredToken {
  const now = Math.floor(Date.now() / 1000);
  return {
    userId: "test-user",
    accessToken: "test-access-token-123",
    tokenType: "Bearer",
    expiresAt: now + 3600, // 1 hour from now
    scopes: ["ads_management", "ads_read"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create an expired test token
 */
export function createExpiredToken(
  overrides: Partial<StoredToken> = {},
): StoredToken {
  const now = Math.floor(Date.now() / 1000);
  return createTestToken({
    expiresAt: now - 3600, // 1 hour ago
    ...overrides,
  });
}

/**
 * Create a token that expires soon (within 5-minute buffer)
 */
export function createSoonExpiringToken(
  overrides: Partial<StoredToken> = {},
): StoredToken {
  const now = Math.floor(Date.now() / 1000);
  return createTestToken({
    expiresAt: now + 60, // 1 minute from now (within 5-min buffer)
    ...overrides,
  });
}

/**
 * Create a token that never expires
 */
export function createNonExpiringToken(
  overrides: Partial<StoredToken> = {},
): StoredToken {
  return createTestToken({
    expiresAt: null,
    ...overrides,
  });
}
