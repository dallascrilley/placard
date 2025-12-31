import { describe, expect, it } from "vitest";
import { normalizeAccountId } from "../../utils/id-normalizer.js";

describe("normalizeAccountId", () => {
  it("should add act_ prefix when missing", () => {
    expect(normalizeAccountId("123456789")).toBe("act_123456789");
  });

  it("should keep act_ prefix when already present", () => {
    expect(normalizeAccountId("act_123456789")).toBe("act_123456789");
  });

  it("should handle numeric-only IDs", () => {
    expect(normalizeAccountId("987654321")).toBe("act_987654321");
  });

  it("should handle empty string", () => {
    expect(normalizeAccountId("")).toBe("act_");
  });

  it("should not double-prefix if act_ appears elsewhere in ID", () => {
    // Edge case: act_ in the middle shouldn't affect prefix logic
    expect(normalizeAccountId("123_act_456")).toBe("act_123_act_456");
  });

  it("should handle act_ prefix with various ID formats", () => {
    expect(normalizeAccountId("act_")).toBe("act_");
    expect(normalizeAccountId("act_0")).toBe("act_0");
    expect(normalizeAccountId("act_abc123")).toBe("act_abc123");
  });
});
