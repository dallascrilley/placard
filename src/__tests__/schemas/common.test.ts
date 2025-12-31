/**
 * Tests for common Zod schemas
 */

import { describe, expect, it } from "vitest";
import {
  accountIdSchema,
  breakdownSchema,
  createLimitSchema,
  dailyBudgetSchema,
  datePresetSchema,
  fieldsSchema,
  lifetimeBudgetSchema,
  optionalTargetingSchema,
  targetingSchema,
  timeRangeSchema,
  userIdSchema,
} from "../../schemas/index.js";

describe("Common Schemas", () => {
  describe("userIdSchema", () => {
    it("accepts valid string", () => {
      const result = userIdSchema.safeParse("user123");
      expect(result.success).toBe(true);
      expect(result.data).toBe("user123");
    });

    it("accepts undefined (optional)", () => {
      const result = userIdSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it("rejects non-string values", () => {
      const result = userIdSchema.safeParse(123);
      expect(result.success).toBe(false);
    });
  });

  describe("accountIdSchema", () => {
    it("accepts valid account ID without prefix", () => {
      const result = accountIdSchema.safeParse("123456789");
      expect(result.success).toBe(true);
    });

    it("accepts valid account ID with act_ prefix", () => {
      const result = accountIdSchema.safeParse("act_123456789");
      expect(result.success).toBe(true);
    });

    it("rejects non-string values", () => {
      const result = accountIdSchema.safeParse(123456789);
      expect(result.success).toBe(false);
    });
  });

  describe("createLimitSchema", () => {
    it("creates schema with custom entity name in description", () => {
      const schema = createLimitSchema("campaigns");
      expect(schema.description).toBe(
        "Maximum number of campaigns to return (default: 25)",
      );
    });

    it("accepts valid limit values", () => {
      const schema = createLimitSchema("items");
      expect(schema.safeParse(1).success).toBe(true);
      expect(schema.safeParse(50).success).toBe(true);
      expect(schema.safeParse(100).success).toBe(true);
    });

    it("accepts undefined (optional)", () => {
      const schema = createLimitSchema("items");
      expect(schema.safeParse(undefined).success).toBe(true);
    });

    it("rejects values outside range", () => {
      const schema = createLimitSchema("items");
      expect(schema.safeParse(0).success).toBe(false);
      expect(schema.safeParse(101).success).toBe(false);
      expect(schema.safeParse(-1).success).toBe(false);
    });

    it("rejects non-integer values", () => {
      const schema = createLimitSchema("items");
      expect(schema.safeParse(25.5).success).toBe(false);
    });
  });

  describe("datePresetSchema", () => {
    it("accepts valid date presets", () => {
      expect(datePresetSchema.safeParse("today").success).toBe(true);
      expect(datePresetSchema.safeParse("last_7d").success).toBe(true);
      expect(datePresetSchema.safeParse("maximum").success).toBe(true);
    });

    it("accepts undefined (optional)", () => {
      expect(datePresetSchema.safeParse(undefined).success).toBe(true);
    });

    it("rejects invalid presets", () => {
      expect(datePresetSchema.safeParse("invalid_preset").success).toBe(false);
    });
  });

  describe("timeRangeSchema", () => {
    it("accepts valid time range", () => {
      const result = timeRangeSchema.safeParse({
        since: "2024-01-01",
        until: "2024-12-31",
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined (optional)", () => {
      expect(timeRangeSchema.safeParse(undefined).success).toBe(true);
    });

    it("rejects incomplete time range", () => {
      expect(timeRangeSchema.safeParse({ since: "2024-01-01" }).success).toBe(
        false,
      );
      expect(timeRangeSchema.safeParse({ until: "2024-12-31" }).success).toBe(
        false,
      );
    });
  });

  describe("breakdownSchema", () => {
    it("accepts valid breakdowns", () => {
      expect(breakdownSchema.safeParse("age").success).toBe(true);
      expect(breakdownSchema.safeParse("gender").success).toBe(true);
    });

    it("accepts undefined (optional)", () => {
      expect(breakdownSchema.safeParse(undefined).success).toBe(true);
    });
  });

  describe("fieldsSchema", () => {
    it("accepts array of field strings", () => {
      const result = fieldsSchema.safeParse(["impressions", "clicks", "spend"]);
      expect(result.success).toBe(true);
    });

    it("accepts undefined (optional)", () => {
      expect(fieldsSchema.safeParse(undefined).success).toBe(true);
    });

    it("accepts empty array", () => {
      expect(fieldsSchema.safeParse([]).success).toBe(true);
    });
  });

  describe("budget schemas", () => {
    it("dailyBudgetSchema accepts positive integers", () => {
      expect(dailyBudgetSchema.safeParse(1000).success).toBe(true);
      expect(dailyBudgetSchema.safeParse(1).success).toBe(true);
    });

    it("dailyBudgetSchema rejects non-positive values", () => {
      expect(dailyBudgetSchema.safeParse(0).success).toBe(false);
      expect(dailyBudgetSchema.safeParse(-100).success).toBe(false);
    });

    it("dailyBudgetSchema accepts undefined", () => {
      expect(dailyBudgetSchema.safeParse(undefined).success).toBe(true);
    });

    it("lifetimeBudgetSchema accepts positive integers", () => {
      expect(lifetimeBudgetSchema.safeParse(10000).success).toBe(true);
    });

    it("lifetimeBudgetSchema accepts undefined", () => {
      expect(lifetimeBudgetSchema.safeParse(undefined).success).toBe(true);
    });
  });

  describe("targeting schemas", () => {
    it("targetingSchema accepts object records", () => {
      const result = targetingSchema.safeParse({
        geo_locations: { countries: ["US"] },
        age_min: 18,
        age_max: 65,
      });
      expect(result.success).toBe(true);
    });

    it("optionalTargetingSchema accepts undefined", () => {
      expect(optionalTargetingSchema.safeParse(undefined).success).toBe(true);
    });

    it("optionalTargetingSchema accepts object records", () => {
      const result = optionalTargetingSchema.safeParse({
        interests: [{ id: "123", name: "Technology" }],
      });
      expect(result.success).toBe(true);
    });
  });
});
