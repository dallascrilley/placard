import { describe, expect, it } from "vitest";
import {
  validateAdvantageAgeConstraint,
  validateCboBudgetConstraint,
  validateGeoRadius,
} from "../../tools/adsets.js";

describe("Geo radius validation", () => {
  it("should allow city radius within 10–50 mi", () => {
    expect(
      validateGeoRadius({
        geo_locations: {
          cities: [{ key: "2430536", radius: 25, distance_unit: "mile" }],
        },
      }),
    ).toBeNull();
    expect(
      validateGeoRadius({
        geo_locations: {
          cities: [{ key: "2430536", radius: 10, distance_unit: "mile" }],
        },
      }),
    ).toBeNull();
    expect(
      validateGeoRadius({
        geo_locations: {
          cities: [{ key: "2430536", radius: 50 }],
        },
      }),
    ).toBeNull();
  });

  it("should reject city radius > 50 mi", () => {
    const result = validateGeoRadius({
      geo_locations: {
        cities: [{ key: "2430536", radius: 75, distance_unit: "mile" }],
      },
    });
    expect(result).toContain("10–50 mi");
    expect(result).toContain("75");
  });

  it("should reject city radius < 10 mi", () => {
    const result = validateGeoRadius({
      geo_locations: {
        cities: [{ key: "2430536", radius: 5, distance_unit: "mile" }],
      },
    });
    expect(result).toContain("10–50 mi");
    expect(result).toContain("5");
  });

  it("should allow custom_locations radius 0.63–50 mi", () => {
    expect(
      validateGeoRadius({
        geo_locations: {
          custom_locations: [{ latitude: 37.5, longitude: -122, radius: 10 }],
        },
      }),
    ).toBeNull();
    expect(
      validateGeoRadius({
        geo_locations: {
          custom_locations: [
            {
              address_string: "1601 Willow Road, Menlo Park, CA",
              radius: 0.63,
            },
          ],
        },
      }),
    ).toBeNull();
  });

  it("should reject custom_locations radius > 50 mi", () => {
    const result = validateGeoRadius({
      geo_locations: {
        custom_locations: [
          {
            latitude: 37.5,
            longitude: -122,
            radius: 75,
            distance_unit: "mile",
          },
        ],
      },
    });
    expect(result).toContain("0.63–50 mi");
    expect(result).toContain("75");
  });

  it("should allow valid km ranges", () => {
    expect(
      validateGeoRadius({
        geo_locations: {
          cities: [{ key: "2430536", radius: 40, distance_unit: "kilometer" }],
        },
      }),
    ).toBeNull();
  });

  it("should return null when no geo_locations", () => {
    expect(validateGeoRadius({})).toBeNull();
    expect(validateGeoRadius({ geo_locations: {} })).toBeNull();
  });
});

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

describe("CBO budget validation", () => {
  it("should reject ad set budget fields when campaign uses daily_budget", () => {
    const result = validateCboBudgetConstraint(
      { daily_budget: "5000" },
      { daily_budget: 1500 },
    );
    expect(result).toContain("campaign budget optimization");
  });

  it("should reject ad set budget fields when campaign uses lifetime_budget", () => {
    const result = validateCboBudgetConstraint(
      { lifetime_budget: "50000" },
      { lifetime_budget: 20000 },
    );
    expect(result).toContain("campaign budget optimization");
  });

  it("should allow ad set budget fields when campaign has no campaign-level budget", () => {
    const result = validateCboBudgetConstraint({}, { daily_budget: 1500 });
    expect(result).toBeNull();
  });

  it("should allow when ad set budget is not provided", () => {
    const result = validateCboBudgetConstraint({ daily_budget: "5000" }, {});
    expect(result).toBeNull();
  });
});
