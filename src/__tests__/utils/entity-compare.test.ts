import { describe, expect, it } from "vitest";
import { compareEntities } from "../../utils/entity-compare.js";

describe("compareEntities", () => {
  it("returns a full match for identical nested payloads", () => {
    const source = {
      name: "Ad A",
      status: "PAUSED",
      creative: {
        id: "1",
        body: "hello",
      },
    };

    const target = {
      name: "Ad A",
      status: "PAUSED",
      creative: {
        id: "1",
        body: "hello",
      },
    };

    const result = compareEntities(source, target);

    expect(result.match).toBe(true);
    expect(result.summary.different_fields).toBe(0);
    expect(result.differences).toHaveLength(0);
  });

  it("detects changed fields and nested differences", () => {
    const source = {
      name: "Ad A",
      status: "PAUSED",
      creative: {
        id: "1",
        body: "hello",
      },
    };

    const target = {
      name: "Ad B",
      status: "ACTIVE",
      creative: {
        id: "1",
        body: "world",
      },
    };

    const result = compareEntities(source, target);

    expect(result.match).toBe(false);
    expect(result.summary.different_fields).toBe(3);
    expect(result.differences.map((d) => d.field)).toEqual([
      "creative.body",
      "name",
      "status",
    ]);
  });

  it("supports ignore fields with nested prefixes", () => {
    const source = {
      id: "1",
      updated_time: "2026-03-01",
      creative: {
        id: "10",
        body: "same",
      },
    };

    const target = {
      id: "2",
      updated_time: "2026-03-02",
      creative: {
        id: "20",
        body: "same",
      },
    };

    const result = compareEntities(source, target, {
      ignoreFields: ["id", "updated_time", "creative.id"],
    });

    expect(result.match).toBe(true);
    expect(result.summary.total_compared_fields).toBe(1);
    expect(result.differences).toHaveLength(0);
  });

  it("reports missing fields on either side", () => {
    const source = {
      name: "Campaign A",
      objective: "OUTCOME_TRAFFIC",
    };

    const target = {
      name: "Campaign A",
      status: "PAUSED",
    };

    const result = compareEntities(source, target);

    expect(result.match).toBe(false);
    expect(result.summary.missing_in_source).toBe(1);
    expect(result.summary.missing_in_target).toBe(1);

    const statuses = result.differences.reduce<Record<string, string>>(
      (acc, diff) => {
        acc[diff.field] = diff.status;
        return acc;
      },
      {},
    );

    expect(statuses["objective"]).toBe("missing_in_target");
    expect(statuses["status"]).toBe("missing_in_source");
  });
});
