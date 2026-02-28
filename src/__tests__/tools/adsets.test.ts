import { describe, expect, it } from "vitest";
import { validateAdvantageAgeConstraint } from "../../tools/adsets.js";

describe("Advantage+ audience age validation", () => {
  it("should reject age_max < 65 when advantage_audience is not set", () => {
    const result = validateAdvantageAgeConstraint({
      age_min: 25,
      age_max: 45,
    });
    expect(result).toContain("age_max (45) is below 65");
  });

  it("should reject age_max < 65 when advantage_audience is 1", () => {
    const result = validateAdvantageAgeConstraint({
      age_min: 25,
      age_max: 45,
      targeting_automation: { advantage_audience: 1 },
    });
    expect(result).toContain("age_max (45) is below 65");
  });

  it("should allow age_max < 65 when advantage_audience is 0", () => {
    const result = validateAdvantageAgeConstraint({
      age_min: 25,
      age_max: 45,
      targeting_automation: { advantage_audience: 0 },
    });
    expect(result).toBeNull();
  });

  it("should allow age_max = 65 with advantage_audience", () => {
    const result = validateAdvantageAgeConstraint({
      age_min: 25,
      age_max: 65,
    });
    expect(result).toBeNull();
  });

  it("should allow no age_max at all", () => {
    const result = validateAdvantageAgeConstraint({ age_min: 25 });
    expect(result).toBeNull();
  });
});
