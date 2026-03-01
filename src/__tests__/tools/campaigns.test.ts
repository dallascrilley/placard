import { describe, expect, it } from "vitest";
import {
  validateStopTimeBudgetCompatibility,
  validateTimestampTimezone,
} from "../../tools/campaigns.js";

describe("stop_time budget compatibility validation", () => {
  it("should reject stop_time when only daily_budget is present", () => {
    const result = validateStopTimeBudgetCompatibility(
      "2026-03-15T23:59:59+0000",
      { daily_budget: 5000 },
    );
    expect(result).toContain("only honored on lifetime_budget campaigns");
  });

  it("should allow stop_time when lifetime_budget is present", () => {
    const result = validateStopTimeBudgetCompatibility(
      "2026-03-15T23:59:59+0000",
      { lifetime_budget: 50000 },
    );
    expect(result).toBeNull();
  });

  it("should allow when stop_time is omitted", () => {
    const result = validateStopTimeBudgetCompatibility(undefined, {
      daily_budget: 5000,
    });
    expect(result).toBeNull();
  });
});

describe("timestamp timezone validation", () => {
  it("should reject missing timezone offset", () => {
    const result = validateTimestampTimezone(
      "stop_time",
      "2026-03-15T23:59:59",
    );
    expect(result).toContain("must include a timezone offset");
  });

  it("should allow +0000 offset", () => {
    const result = validateTimestampTimezone(
      "stop_time",
      "2026-03-15T23:59:59+0000",
    );
    expect(result).toBeNull();
  });

  it("should allow Z suffix", () => {
    const result = validateTimestampTimezone(
      "start_time",
      "2026-03-01T00:00:00Z",
    );
    expect(result).toBeNull();
  });
});
