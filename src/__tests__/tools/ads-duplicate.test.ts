import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as metaClientModule from "../../api/meta-client.js";
import { MetaClient } from "../../api/meta-client.js";
import { registerAdTools } from "../../tools/ads.js";
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

describe("Ad duplicate tool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should clone source creative in target account before creating ad", async () => {
    const tool = vi.fn();
    registerAdTools({ tool } as unknown as McpServer);
    const handler = getRegisteredToolHandler(tool, "meta_duplicate_ad");

    vi.spyOn(metaClientModule, "createMetaClient").mockReturnValue(
      new MetaClient({ accessToken: "test-token" }),
    );

    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            id: "ad_src_1",
            name: "Source Ad",
            adset_id: "as_1",
            campaign_id: "camp_1",
            status: "PAUSED",
            effective_status: "PAUSED",
            creative: {
              id: "cr_src_1",
              name: "Source Creative",
              object_story_spec: {
                page_id: "123",
                link_data: {
                  link: "https://example.com",
                  message: "Hello",
                },
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            id: "cr_new_1",
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            id: "ad_new_1",
          },
        }),
      );

    const response = await handler(
      {
        source_ad_id: "ad_src_1",
        target_account_id: "act_999",
        target_adset_id: "as_tgt_1",
        response_format: "json",
      },
      {},
    );

    const payload = JSON.parse(response.content[0]?.text ?? "{}");
    expect(payload.success).toBe(true);
    expect(payload.ad_id).toBe("ad_new_1");
    expect(payload.source_creative_id).toBe("cr_src_1");
    expect(payload.creative_id).toBe("cr_new_1");

    const creativeCreateCall = mockFetch.mock.calls[1];
    const adCreateCall = mockFetch.mock.calls[2];
    expect(String(creativeCreateCall?.[0])).toContain("/act_999/adcreatives");
    expect(String(adCreateCall?.[0])).toContain("/act_999/ads");

    const adCreateBody = JSON.parse(String(adCreateCall?.[1]?.body ?? "{}"));
    expect(adCreateBody.creative).toEqual({ creative_id: "cr_new_1" });
  });

  it("should fail when source creative cannot be cloned", async () => {
    const tool = vi.fn();
    registerAdTools({ tool } as unknown as McpServer);
    const handler = getRegisteredToolHandler(tool, "meta_duplicate_ad");

    vi.spyOn(metaClientModule, "createMetaClient").mockReturnValue(
      new MetaClient({ accessToken: "test-token" }),
    );

    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        body: {
          id: "ad_src_2",
          name: "Source Ad",
          adset_id: "as_2",
          campaign_id: "camp_2",
          status: "PAUSED",
          effective_status: "PAUSED",
          creative: {
            id: "cr_src_2",
          },
        },
      }),
    );

    const response = await handler(
      {
        source_ad_id: "ad_src_2",
        target_account_id: "act_777",
        target_adset_id: "as_tgt_2",
        response_format: "json",
      },
      {},
    );

    expect(response.isError).toBe(true);
    const payload = JSON.parse(response.content[0]?.text ?? "{}");
    expect(payload.success).toBe(false);
    expect(String(payload.error)).toContain("cannot be cloned");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should generate a unique fallback creative name when source name is missing", async () => {
    const tool = vi.fn();
    registerAdTools({ tool } as unknown as McpServer);
    const handler = getRegisteredToolHandler(tool, "meta_duplicate_ad");

    vi.spyOn(metaClientModule, "createMetaClient").mockReturnValue(
      new MetaClient({ accessToken: "test-token" }),
    );

    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            id: "ad_src_3",
            name: "Source Ad",
            adset_id: "as_3",
            campaign_id: "camp_3",
            status: "PAUSED",
            effective_status: "PAUSED",
            creative: {
              id: "cr_src_3",
              object_story_spec: {
                page_id: "123",
                link_data: {
                  link: "https://example.com",
                  message: "Hello",
                },
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(createMockResponse({ body: { id: "cr_new_3" } }))
      .mockResolvedValueOnce(createMockResponse({ body: { id: "ad_new_3" } }));

    await handler(
      {
        source_ad_id: "ad_src_3",
        target_account_id: "act_999",
        target_adset_id: "as_tgt_3",
        response_format: "json",
      },
      {},
    );

    const creativeCreateCall = mockFetch.mock.calls[1];
    const creativeCreateBody = JSON.parse(
      String(creativeCreateCall?.[1]?.body ?? "{}"),
    );
    expect(creativeCreateBody.name).toMatch(
      /^Source Ad \(Copy Creative \d{4}-\d{2}-\d{2}T/,
    );
  });
});
