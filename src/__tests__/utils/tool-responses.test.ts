import { describe, expect, it } from "vitest";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../../utils/tool-responses.js";

describe("createSuccessResponse", () => {
  it("should create response with success: true", () => {
    const response = createSuccessResponse({ data: "test" });

    expect(response.content).toHaveLength(1);
    expect(response.content[0]?.type).toBe("text");
    expect(response.isError).toBeUndefined();

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.success).toBe(true);
    expect(parsed.data).toBe("test");
  });

  it("should spread data properties into response", () => {
    const response = createSuccessResponse({
      campaigns: [{ id: "1" }],
      paging: { next: "url" },
    });

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.success).toBe(true);
    expect(parsed.campaigns).toEqual([{ id: "1" }]);
    expect(parsed.paging).toEqual({ next: "url" });
  });

  it("should format JSON with 2-space indentation", () => {
    const response = createSuccessResponse({ id: "123" });
    expect(response.content[0]?.text).toContain("\n");
    expect(response.content[0]?.text).toContain("  ");
  });

  it("should handle empty data object", () => {
    const response = createSuccessResponse({});

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed).toEqual({ success: true });
  });
});

describe("createErrorResponse", () => {
  it("should create response with success: false and isError: true", () => {
    const response = createErrorResponse(new Error("Something failed"));

    expect(response.content).toHaveLength(1);
    expect(response.content[0]?.type).toBe("text");
    expect(response.isError).toBe(true);

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("Something failed");
  });

  it("should handle Error instances", () => {
    const response = createErrorResponse(new Error("Test error"));

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.error).toBe("Test error");
  });

  it("should handle string errors", () => {
    const response = createErrorResponse("String error message");

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.error).toBe("String error message");
  });

  it("should handle unknown error types", () => {
    const response = createErrorResponse({ custom: "error" });

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.error).toBe("[object Object]");
  });

  it("should handle null/undefined errors", () => {
    const nullResponse = createErrorResponse(null);
    const undefinedResponse = createErrorResponse(undefined);

    expect(JSON.parse(nullResponse.content[0]?.text ?? "{}").error).toBe(
      "null",
    );
    expect(JSON.parse(undefinedResponse.content[0]?.text ?? "{}").error).toBe(
      "undefined",
    );
  });

  it("should format JSON with 2-space indentation", () => {
    const response = createErrorResponse(new Error("test"));
    expect(response.content[0]?.text).toContain("\n");
  });
});
