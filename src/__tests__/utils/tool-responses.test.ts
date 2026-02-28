import { describe, expect, it } from "vitest";
import {
  createErrorResponse,
  createSuccessResponse,
  enhancePagination,
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

  it("should return compact list format with header row", () => {
    const response = createSuccessResponse(
      {
        creatives: [
          { id: "1", name: "A", body: "copy a" },
          { id: "2", name: "B", body: "copy b" },
        ],
      },
      "compact",
    );

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.success).toBe(true);
    expect(parsed.creatives).toEqual([
      ["id", "name", "body"],
      ["1", "A", "copy a"],
      ["2", "B", "copy b"],
    ]);
  });

  it("should preserve paging metadata in compact format", () => {
    const response = createSuccessResponse(
      {
        creatives: [{ id: "1", name: "A" }],
        paging: { cursors: { after: "cursor_1" }, has_more: true, count: 1 },
      },
      "compact",
    );

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.creatives).toEqual([
      ["id", "name"],
      ["1", "A"],
    ]);
    expect(parsed.paging).toEqual({
      cursors: { after: "cursor_1" },
      has_more: true,
      count: 1,
    });
  });

  it("should summarize oversized JSON responses", () => {
    const previous = process.env["MCP_RESPONSE_MAX_BYTES"];
    process.env["MCP_RESPONSE_MAX_BYTES"] = "1200";
    try {
      const response = createSuccessResponse({
        creatives: Array.from({ length: 10 }).map((_, i) => ({
          id: `id_${i}`,
          object_story_spec: {
            link_data: {
              message: "x".repeat(500),
            },
          },
        })),
        paging: {
          cursors: { after: "cursor_after", before: "cursor_before" },
          next: "https://graph.facebook.com/v22.0/next",
        },
      });

      const parsed = JSON.parse(response.content[0]?.text ?? "{}");
      expect(parsed.success).toBe(true);
      expect(parsed.truncated).toBe(true);
      expect(parsed.warning).toContain("Response exceeded size limit");
      expect(parsed.paging).toEqual({
        cursors: { after: "cursor_after", before: "cursor_before" },
        next: "https://graph.facebook.com/v22.0/next",
      });
      if (parsed.preview) {
        expect(parsed.preview.creatives.type).toBe("array");
      }
    } finally {
      if (previous === undefined) {
        process.env["MCP_RESPONSE_MAX_BYTES"] = undefined;
      } else {
        process.env["MCP_RESPONSE_MAX_BYTES"] = previous;
      }
    }
  });

  it("should summarize oversized markdown responses", () => {
    const previous = process.env["MCP_RESPONSE_MAX_BYTES"];
    process.env["MCP_RESPONSE_MAX_BYTES"] = "1200";
    try {
      const response = createSuccessResponse(
        {
          creatives: Array.from({ length: 5 }).map((_, i) => ({
            id: `id_${i}`,
            body: "y".repeat(400),
          })),
          paging: {
            cursors: { after: "cursor_after", before: "cursor_before" },
            next: "https://graph.facebook.com/v22.0/next",
          },
        },
        "markdown",
      );

      const text = response.content[0]?.text ?? "";
      if (text.trim().startsWith("{")) {
        const parsed = JSON.parse(text);
        expect(parsed.truncated).toBe(true);
        expect(parsed.paging).toEqual({
          cursors: { after: "cursor_after", before: "cursor_before" },
          next: "https://graph.facebook.com/v22.0/next",
        });
      } else {
        expect(text).toContain("Truncated");
        expect(text).toContain("Warning");
        expect(text).toContain("More results available");
      }
    } finally {
      if (previous === undefined) {
        process.env["MCP_RESPONSE_MAX_BYTES"] = undefined;
      } else {
        process.env["MCP_RESPONSE_MAX_BYTES"] = previous;
      }
    }
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

  it("should handle unknown error types by JSON-stringifying", () => {
    const response = createErrorResponse({ custom: "error" });

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    // Objects without message/error fields are JSON-stringified
    expect(parsed.error).toBe('{"custom":"error"}');
  });

  it("should extract message and code from error objects", () => {
    const response = createErrorResponse({
      message: "API error",
      code: 190,
      fbtrace_id: "abc123",
    });

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.error).toBe("API error");
    expect(parsed.error_code).toBe(190);
    expect(parsed.error_details).toEqual({ fbtrace_id: "abc123" });
  });

  it("should handle error objects with 'error' field instead of 'message'", () => {
    const response = createErrorResponse({
      error: "Something went wrong",
      error_code: "AUTH_FAILED",
    });

    const parsed = JSON.parse(response.content[0]?.text ?? "{}");
    expect(parsed.error).toBe("Something went wrong");
    expect(parsed.error_code).toBe("AUTH_FAILED");
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

describe("enhancePagination", () => {
  it("should include total_count and page info when summary metadata is provided", () => {
    const paging = enhancePagination(
      { cursors: { before: "b", after: "a" }, next: "next_url" },
      [{ id: "1" }, { id: "2" }],
      { totalCount: 48, limit: 25, cursorProvided: false },
    );

    expect(paging.count).toBe(2);
    expect(paging.has_more).toBe(true);
    expect(paging.total_count).toBe(48);
    expect(paging.page).toEqual({ current: 1, total: 2 });
  });

  it("should set current page to null when cursor input is provided", () => {
    const paging = enhancePagination(
      { cursors: { before: "b", after: "a" } },
      [{ id: "1" }],
      { totalCount: 100, limit: 25, cursorProvided: true },
    );

    expect(paging.page).toEqual({ current: null, total: 4 });
  });
});
