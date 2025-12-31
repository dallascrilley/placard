/**
 * Common Zod Schemas
 *
 * Reusable schema fragments for MCP tool definitions.
 * These eliminate duplication across tool files while maintaining
 * consistent validation and descriptions.
 */

import { z } from "zod";
import { BREAKDOWNS, DATE_PRESETS } from "../constants/index.js";

// =============================================================================
// Identity Schemas
// =============================================================================

/**
 * User ID for multi-user authentication.
 * Used across all tools to support multi-tenant token storage.
 */
export const userIdSchema = z
  .string()
  .optional()
  .describe("User ID for multi-user authentication (default: 'default')");

/**
 * Ad account ID with support for act_ prefix.
 * Meta API requires act_ prefix but we normalize for user convenience.
 */
export const accountIdSchema = z
  .string()
  .describe("Ad account ID (with or without 'act_' prefix)");

// =============================================================================
// Pagination Schemas
// =============================================================================

/**
 * Create a limit schema with a custom description.
 * Use when the entity type needs to be specified.
 */
export function createLimitSchema(entityName: string) {
  return z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum number of ${entityName} to return (default: 25)`);
}

// =============================================================================
// Insights Schemas
// =============================================================================

/**
 * Predefined date range options for insights.
 */
export const datePresetSchema = z
  .enum(DATE_PRESETS)
  .optional()
  .describe("Predefined date range (default: 'maximum')");

/**
 * Custom date range for insights queries.
 * Overrides date_preset when provided.
 */
export const timeRangeSchema = z
  .object({
    since: z.string().describe("Start date in YYYY-MM-DD format"),
    until: z.string().describe("End date in YYYY-MM-DD format"),
  })
  .optional()
  .describe("Custom date range (overrides date_preset)");

/**
 * Breakdown dimension for insights data.
 */
export const breakdownSchema = z
  .enum(BREAKDOWNS)
  .optional()
  .describe("Breakdown dimension for the data");

/**
 * Custom fields selection for insights.
 */
export const fieldsSchema = z
  .array(z.string())
  .optional()
  .describe("Specific fields to return (default: standard metrics)");

// =============================================================================
// Budget Schemas
// =============================================================================

/**
 * Daily budget in cents.
 * Used for campaigns and ad sets.
 */
export const dailyBudgetSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Daily budget in cents (e.g., 1000 = $10.00)");

/**
 * Lifetime budget in cents.
 * Used for campaigns and ad sets.
 */
export const lifetimeBudgetSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Lifetime budget in cents (e.g., 10000 = $100.00)");

// =============================================================================
// Targeting Schemas
// =============================================================================

/**
 * Targeting specification object.
 * Flexible schema to accommodate Meta's complex targeting structure.
 */
export const targetingSchema = z
  .record(z.unknown())
  .describe("Targeting specification object");

/**
 * Optional targeting schema for update operations.
 */
export const optionalTargetingSchema = z
  .record(z.unknown())
  .optional()
  .describe("New targeting specification");

