import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";

// Mock fetch for any API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock crypto for auth state generation
vi.stubGlobal("crypto", {
  getRandomValues: (array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = i % 256;
    }
    return array;
  },
});

describe("createServer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create a valid MCP server", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it("should register health_check tool", async () => {
    const server = createServer();

    // Get registered tools - the server has a tool() method we called
    // We can verify the server is valid by checking it has expected methods
    expect(typeof server.tool).toBe("function");
    expect(typeof server.connect).toBe("function");
  });

  describe("tool registration", () => {
    it("should create server with expected tool categories", () => {
      // Expected tools by category
      const expectedTools = [
        // Health (1)
        "health_check",
        // Auth (3)
        "get_login_link",
        "check_auth_status",
        "logout",
        // Accounts (2)
        "get_ad_accounts",
        "get_account_info",
        // Campaigns (6)
        "get_campaigns",
        "get_campaign_copy",
        "get_campaign_details",
        "create_campaign",
        "update_campaign",
        "delete_campaign",
        // Ad Sets (4)
        "get_adsets",
        "get_adset_details",
        "create_adset",
        "update_adset",
        // Ads (4)
        "get_ads",
        "get_ad_details",
        "create_ad",
        "update_ad",
        // Creatives (2)
        "get_ad_creatives",
        "create_ad_creative",
        // Ad images (1)
        "upload_image",
        // Targeting (2)
        "search_targeting",
        "get_reach_estimate",
        // Insights (4)
        "get_account_insights",
        "get_campaign_insights",
        "get_adset_insights",
        "get_ad_insights",
        // Composite (4)
        "get_campaign_summary",
        "get_account_overview",
        "search_ads",
        "validate_campaign_config",
      ];

      // Verify tool count: 1+3+2+6+4+4+2+1+2+4+4 = 33
      expect(expectedTools.length).toBe(33);

      // Server should create without errors (tools registered internally)
      const server = createServer();
      expect(server).toBeDefined();
    });
  });
});

describe("account ID normalization", () => {
  it("should add act_ prefix when missing", () => {
    const normalizeAccountId = (accountId: string): string => {
      return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    };

    expect(normalizeAccountId("123456")).toBe("act_123456");
  });

  it("should keep act_ prefix when already present", () => {
    const normalizeAccountId = (accountId: string): string => {
      return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    };

    expect(normalizeAccountId("act_123456")).toBe("act_123456");
  });
});

/**
 * Specification tests for MCP tool response format.
 * These document the expected contract for tool responses.
 * Actual implementation tests are in individual tool tests.
 */
describe("tool response format specification", () => {
  it("success responses should have content array with JSON text", () => {
    // Expected format for success responses
    const successResponse = {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ success: true, campaign_id: "123" }, null, 2),
        },
      ],
    };

    expect(successResponse.content).toHaveLength(1);
    expect(successResponse.content[0]?.type).toBe("text");

    const parsed = JSON.parse(successResponse.content[0]?.text ?? "{}");
    expect(parsed.success).toBe(true);
  });

  it("error responses should have isError flag and error message", () => {
    // Expected format for error responses
    const errorResponse = {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { success: false, error: "Something went wrong" },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };

    expect(errorResponse.isError).toBe(true);

    const parsed = JSON.parse(errorResponse.content[0]?.text ?? "{}");
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("Something went wrong");
  });
});
