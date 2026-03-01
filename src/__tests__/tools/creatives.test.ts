import { describe, expect, it } from "vitest";
import {
  validateCreativeCallToAction,
  validateCreativeSpecInputs,
} from "../../tools/creatives.js";

describe("creative spec validation", () => {
  it("should require one spec", () => {
    const result = validateCreativeSpecInputs(undefined, undefined);
    expect(result).toContain("Provide one creative specification");
  });

  it("should reject both specs at once", () => {
    const result = validateCreativeSpecInputs(
      { page_id: "123" },
      { bodies: [{ text: "A" }] },
    );
    expect(result).toContain("either object_story_spec or asset_feed_spec");
  });

  it("should allow object_story_spec only", () => {
    const result = validateCreativeSpecInputs({ page_id: "123" }, undefined);
    expect(result).toBeNull();
  });

  it("should allow asset_feed_spec only", () => {
    const result = validateCreativeSpecInputs(undefined, {
      bodies: [{ text: "A" }],
    });
    expect(result).toBeNull();
  });
});

describe("creative CTA validation", () => {
  it("should reject GET_TICKETS for object_story_spec link_data", () => {
    const result = validateCreativeCallToAction({
      page_id: "123",
      link_data: {
        call_to_action: {
          type: "GET_TICKETS",
        },
      },
    });
    expect(result).toContain("GET_TICKETS");
    expect(result).toContain("BUY_TICKETS");
  });

  it("should allow BUY_TICKETS for object_story_spec link_data", () => {
    const result = validateCreativeCallToAction({
      page_id: "123",
      link_data: {
        call_to_action: {
          type: "BUY_TICKETS",
        },
      },
    });
    expect(result).toBeNull();
  });

  it("should allow when object_story_spec is missing", () => {
    const result = validateCreativeCallToAction(undefined);
    expect(result).toBeNull();
  });
});
