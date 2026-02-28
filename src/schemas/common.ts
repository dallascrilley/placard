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

/**
 * Cursor-based pagination token from Graph API paging.cursors.
 */
export const paginationCursorSchema = z
  .string()
  .optional()
  .describe("Pagination cursor from a previous response");

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
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const timeRangeSchema = z
  .object({
    since: dateStringSchema.describe("Start date in YYYY-MM-DD format"),
    until: dateStringSchema.describe("End date in YYYY-MM-DD format"),
  })
  .strict()
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
 * Custom fields selection.
 */
export const fieldsSchema = z
  .array(
    z
      .string()
      .min(1)
      .regex(
        /^[a-zA-Z0-9_.{},-]+$/,
        "Field names can only include letters, numbers, _, ., { }, , and -",
      ),
  )
  .max(50, "Too many fields requested (max 50)")
  .optional()
  .describe("Specific fields to return (uses tool defaults when omitted)");

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

// =============================================================================
// Response Format Schema
// =============================================================================

/**
 * Response format options for tool output.
 * JSON is structured data, Markdown is human-readable.
 */
export const responseFormatSchema = z
  .enum(["json", "markdown"])
  .optional()
  .describe(
    "Response format: 'json' (default) or 'markdown' for human-readable output",
  );
