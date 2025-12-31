/**
 * Utility functions for normalizing Meta API entity IDs.
 */

/**
 * Normalizes an account ID to ensure it has the required 'act_' prefix.
 * Meta's API requires account IDs to be prefixed with 'act_'.
 *
 * @param accountId - The account ID, with or without the 'act_' prefix
 * @returns The account ID with the 'act_' prefix
 *
 * @example
 * normalizeAccountId("123456789") // returns "act_123456789"
 * normalizeAccountId("act_123456789") // returns "act_123456789"
 */
export function normalizeAccountId(accountId: string): string {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}
