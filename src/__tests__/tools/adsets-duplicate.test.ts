import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as metaClientModule from "../../api/meta-client.js";
import { MetaClient } from "../../api/meta-client.js";
import { registerAdSetTools } from "../../tools/adsets.js";
import { createMockResponse } from "../utils/mock-fetch.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.spyOn(console, "error").mockImplementation(() => {});

interface ToolHandlerResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function getRegisteredToolHandler(
  toolMock: ReturnType<typeof vi.fn>,
  toolName: string,
): (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<ToolHandlerResponse> {
  const call = toolMock.mock.calls.find((entry) => entry[0] === toolName);
  expect(call).toBeDefined();
  return call?.[4] as (
    args: Record<string, unknown>,
    extra: unknown,
  ) => Promise<ToolHandlerResponse>;
}

describe("Ad set duplicate tool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should normalize pacing_type arrays to first valid string before create", async () => {
    const tool = vi.fn();
    registerAdSetTools({ tool } as unknown as McpServer);
    const handler = getRegisteredToolHandler(tool, "meta_duplicate_adset");

    vi.spyOn(metaClientModule, "createMetaClient").mockReturnValue(
      new MetaClient({ accessToken: "test-token" }),
    );

    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            id: "as_src_1",
            name: "Source Ad Set",
            optimization_goal: "LINK_CLICKS",
            billing_event: "IMPRESSIONS",
            targeting: { geo_locations: { countries: ["US"] } },
            daily_budget: "1000",
            pacing_type: [123, "no_pacing"],
          },
        }),
      )
      .mockResolvedValueOnce(createMockResponse({ body: { id: "as_new_1" } }));

    const response = await handler(
      {
        source_adset_id: "as_src_1",
        target_account_id: "act_999",
        target_campaign_id: "camp_999",
        response_format: "json",
      },
      {},
    );

    const payload = JSON.parse(response.content[0]?.text ?? "{}");
    expect(payload.success).toBe(true);
    expect(payload.adset_id).toBe("as_new_1");

    const createCall = mockFetch.mock.calls[1];
    const createBody = JSON.parse(String(createCall?.[1]?.body ?? "{}"));
    expect(createBody.pacing_type).toBe('["no_pacing"]');
  });
});
