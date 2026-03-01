import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { MetaClient } from "../../api/meta-client.js";
import type { BatchCampaignConfig } from "../../schemas/index.js";
import {
  executeBatch,
  registerBatchTools,
  validateConfig,
} from "../../tools/batch.js";

function parseToolResponseText(response: { content: Array<{ text: string }> }) {
  return JSON.parse(response.content[0]?.text ?? "{}");
}

function buildValidConfig(): BatchCampaignConfig {
  return {
    shared_creatives: [
      {
        ref: "hero",
        name: "Hero Creative",
        object_story_spec: {
          page_id: "123",
          link_data: {
            message: "Shop now",
            link: "https://example.com",
          },
        },
      },
    ],
    campaigns: [
      {
        name: "Campaign A",
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        daily_budget: 5000,
        ad_sets: [
          {
            name: "Ad Set A",
            optimization_goal: "LINK_CLICKS",
            billing_event: "IMPRESSIONS",
            targeting: {
              geo_locations: { countries: ["US"] },
              age_min: 25,
              age_max: 65,
            },
            ads: [
              {
                name: "Ad A",
                creative_ref: "hero",
              },
            ],
          },
        ],
      },
    ],
  };
}

function requireCampaign(config: BatchCampaignConfig) {
  const campaign = config.campaigns[0];
  if (!campaign) {
    throw new Error("Expected a campaign in test config");
  }
  return campaign;
}

function requireAdSet(config: BatchCampaignConfig) {
  const campaign = requireCampaign(config);
  const adSet = campaign.ad_sets[0];
  if (!adSet) {
    throw new Error("Expected an ad set in test config");
  }
  return adSet;
}

describe("batch config validation", () => {
  it("rejects missing budget", () => {
    const config = buildValidConfig();
    const campaign = requireCampaign(config);
    const adSet = requireAdSet(config);
    config.campaigns[0] = {
      ...campaign,
      daily_budget: undefined,
      ad_sets: [
        {
          ...adSet,
          daily_budget: undefined,
          lifetime_budget: undefined,
        },
      ],
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes(
          "Campaign requires either daily_budget or lifetime_budget",
        ),
      ),
    ).toBe(true);
  });

  it("rejects invalid timezone", () => {
    const config = buildValidConfig();
    const campaign = requireCampaign(config);
    config.campaigns[0] = {
      ...campaign,
      stop_time: "2026-03-15T23:59:59",
      lifetime_budget: 10000,
      daily_budget: undefined,
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes("must include a timezone offset"),
      ),
    ).toBe(true);
  });

  it("rejects campaign/ad set CBO conflict", () => {
    const config = buildValidConfig();
    const adSet = requireAdSet(config);
    requireCampaign(config).ad_sets[0] = {
      ...adSet,
      daily_budget: 1000,
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes("campaign budget optimization"),
      ),
    ).toBe(true);
  });

  it("rejects missing creative source", () => {
    const config = buildValidConfig();
    requireAdSet(config).ads[0] = {
      name: "Missing Creative",
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes("exactly one creative source"),
      ),
    ).toBe(true);
  });

  it("rejects unresolved creative_ref", () => {
    const config = buildValidConfig();
    requireAdSet(config).ads[0] = {
      name: "Bad Ref",
      creative_ref: "does-not-exist",
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes("Unknown creative_ref"),
      ),
    ).toBe(true);
  });

  it("rejects duplicate shared creative refs", () => {
    const config = buildValidConfig();
    config.shared_creatives = [
      config.shared_creatives?.[0],
      {
        ref: "hero",
        name: "Another",
        object_story_spec: {
          page_id: "321",
          link_data: { link: "https://example.com" },
        },
      },
    ].filter(Boolean) as NonNullable<BatchCampaignConfig["shared_creatives"]>;

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes("Duplicate shared creative ref"),
      ),
    ).toBe(true);
  });

  it("supports creatives alias as shared creative source", () => {
    const config = buildValidConfig();
    config.creatives = config.shared_creatives;
    config.shared_creatives = undefined;

    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  it("rejects when creatives and shared_creatives are both provided", () => {
    const config = buildValidConfig();
    config.creatives = config.shared_creatives;

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes("either creatives or shared_creatives"),
      ),
    ).toBe(true);
  });

  it("rejects advantage+ age mismatch", () => {
    const config = buildValidConfig();
    const adSet = requireAdSet(config);
    requireCampaign(config).ad_sets[0] = {
      ...adSet,
      targeting: {
        geo_locations: { countries: ["US"] },
        age_min: 21,
        age_max: 45,
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes("age_max (45) is below 65"),
      ),
    ).toBe(true);
  });

  it("rejects invalid geo radius", () => {
    const config = buildValidConfig();
    const adSet = requireAdSet(config);
    requireCampaign(config).ad_sets[0] = {
      ...adSet,
      targeting: {
        geo_locations: {
          cities: [{ key: "2430536", radius: 75, distance_unit: "mile" }],
        },
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes("City radius must be"),
      ),
    ).toBe(true);
  });

  it("emits promoted_object warning without failing validation", () => {
    const config = buildValidConfig();
    const adSet = requireAdSet(config);
    requireCampaign(config).ad_sets[0] = {
      ...adSet,
      optimization_goal: "EVENT_RESPONSES",
      promoted_object: {
        event_id: "evt_123",
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(
      result.warnings.some((warning) =>
        warning.path.includes("promoted_object.event_id"),
      ),
    ).toBe(true);
  });

  it("rejects unknown image_key references", () => {
    const config = buildValidConfig();
    config.image_hashes = { hero_image: "hash_123" };
    config.shared_creatives = [
      {
        ref: "hero",
        name: "Hero Creative",
        image_key: "missing_key",
        object_story_spec: {
          page_id: "123",
          link_data: { link: "https://example.com" },
        },
      },
    ];

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes('Unknown image_key "missing_key"'),
      ),
    ).toBe(true);
  });

  it("rejects incomplete copy-template creative fields", () => {
    const config = buildValidConfig();
    config.shared_creatives = [
      {
        ref: "hero",
        name: "Hero Creative",
        page_id: "123",
        message: "Missing link field",
      },
    ];

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes(
          "require both page_id and link when object_story_spec is not provided",
        ),
      ),
    ).toBe(true);
  });
});

describe("batch dry-run tool", () => {
  it("returns valid dry-run response for valid config", async () => {
    const tool = vi.fn();
    registerBatchTools({ tool } as unknown as McpServer);

    const handler = tool.mock.calls[0]?.[4] as (
      args: Record<string, unknown>,
      extra: unknown,
    ) => Promise<{ content: Array<{ text: string }> }>;

    const response = await handler(
      {
        account_id: "act_123",
        config: buildValidConfig(),
        dry_run: true,
      },
      {},
    );

    const parsed = parseToolResponseText(response);
    expect(parsed.valid).toBe(true);
    expect(parsed.dry_run).toBe(true);
    expect(parsed.errors).toHaveLength(0);
  });

  it("returns validation errors in dry-run mode", async () => {
    const tool = vi.fn();
    registerBatchTools({ tool } as unknown as McpServer);

    const handler = tool.mock.calls[0]?.[4] as (
      args: Record<string, unknown>,
      extra: unknown,
    ) => Promise<{ content: Array<{ text: string }> }>;

    const invalid = buildValidConfig();
    requireAdSet(invalid).ads[0] = { name: "No Creative" };

    const response = await handler(
      {
        account_id: "act_123",
        config: invalid,
        dry_run: true,
      },
      {},
    );

    const parsed = parseToolResponseText(response);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it("supports loading config from config_path", async () => {
    const tool = vi.fn();
    registerBatchTools({ tool } as unknown as McpServer);

    const handler = tool.mock.calls[0]?.[4] as (
      args: Record<string, unknown>,
      extra: unknown,
    ) => Promise<{ content: Array<{ text: string }> }>;

    const dir = join(process.cwd(), ".tmp-batch-test");
    await mkdir(dir, { recursive: true });
    const configPath = join(dir, "campaign-config.json");
    await writeFile(configPath, JSON.stringify(buildValidConfig()), "utf8");

    try {
      const response = await handler(
        {
          account_id: "act_123",
          config_path: configPath,
          dry_run: true,
        },
        {},
      );

      const parsed = parseToolResponseText(response);
      expect(parsed.valid).toBe(true);
      expect(parsed.summary.campaigns).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects config_path outside working directory", async () => {
    const tool = vi.fn();
    registerBatchTools({ tool } as unknown as McpServer);

    const handler = tool.mock.calls[0]?.[4] as (
      args: Record<string, unknown>,
      extra: unknown,
    ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

    const response = await handler(
      {
        account_id: "act_123",
        config_path: "/tmp/malicious-config.json",
        dry_run: true,
      },
      {},
    );

    expect(response.isError).toBe(true);
    const parsed = parseToolResponseText(response);
    expect(parsed.error).toContain("within the working directory");
  });

  it("rejects when both config and config_path are provided", async () => {
    const tool = vi.fn();
    registerBatchTools({ tool } as unknown as McpServer);

    const handler = tool.mock.calls[0]?.[4] as (
      args: Record<string, unknown>,
      extra: unknown,
    ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

    const response = await handler(
      {
        account_id: "act_123",
        config: buildValidConfig(),
        config_path: "/tmp/ignored.json",
        dry_run: true,
      },
      {},
    );

    expect(response.isError).toBe(true);
    const parsed = parseToolResponseText(response);
    expect(parsed.error).toContain("either config or config_path");
  });
});

describe("executeBatch", () => {
  it("creates full hierarchy for happy path", async () => {
    const client = {
      createAdCreative: vi.fn().mockResolvedValue({ id: "cr_1" }),
      createCampaign: vi.fn().mockResolvedValue({ id: "camp_1" }),
      createAdSet: vi.fn().mockResolvedValue({ id: "adset_1" }),
      createAd: vi.fn().mockResolvedValue({ id: "ad_1" }),
    } as unknown as MetaClient;

    const result = await executeBatch(client, "act_123", buildValidConfig());

    expect(result.completed).toBe(true);
    expect(result.summary).toEqual({
      campaigns: 1,
      ad_sets: 1,
      creatives: 1,
      ads: 1,
    });
    expect(result.created.some((item) => item.type === "campaign")).toBe(true);
  });

  it("supports multi-campaign creation with shared creative refs", async () => {
    const config = buildValidConfig();
    config.campaigns.push({
      name: "Campaign B",
      objective: "OUTCOME_TRAFFIC",
      daily_budget: 6000,
      ad_sets: [
        {
          name: "Ad Set B",
          optimization_goal: "LINK_CLICKS",
          billing_event: "IMPRESSIONS",
          targeting: {
            geo_locations: { countries: ["US"] },
            age_min: 30,
            age_max: 65,
          },
          ads: [
            {
              name: "Ad B",
              creative_ref: "hero",
            },
          ],
        },
      ],
    });

    const createAdCreative = vi.fn().mockResolvedValue({ id: "cr_1" });
    const client = {
      createAdCreative,
      createCampaign: vi
        .fn()
        .mockResolvedValueOnce({ id: "camp_1" })
        .mockResolvedValueOnce({ id: "camp_2" }),
      createAdSet: vi
        .fn()
        .mockResolvedValueOnce({ id: "adset_1" })
        .mockResolvedValueOnce({ id: "adset_2" }),
      createAd: vi
        .fn()
        .mockResolvedValueOnce({ id: "ad_1" })
        .mockResolvedValueOnce({ id: "ad_2" }),
    } as unknown as MetaClient;

    const result = await executeBatch(client, "act_123", config);

    expect(result.completed).toBe(true);
    expect(result.summary).toEqual({
      campaigns: 2,
      ad_sets: 2,
      creatives: 1,
      ads: 2,
    });
    expect(createAdCreative).toHaveBeenCalledTimes(1);
  });

  it("returns partial progress when a tier fails", async () => {
    const client = {
      createAdCreative: vi.fn().mockResolvedValue({ id: "cr_1" }),
      createCampaign: vi.fn().mockResolvedValue({ id: "camp_1" }),
      createAdSet: vi.fn().mockRejectedValue(new Error("ad set failed")),
      createAd: vi.fn(),
    } as unknown as MetaClient;

    const result = await executeBatch(client, "act_123", buildValidConfig());

    expect(result.completed).toBe(false);
    expect(result.error?.tier).toBe("ad_sets");
    expect(result.error?.message).toContain("ad set failed");
    expect(result.created.some((item) => item.type === "campaign")).toBe(true);
  });

  it("records inline creative when ad creation fails after creative creation", async () => {
    const config: BatchCampaignConfig = {
      campaigns: [
        {
          name: "Campaign Inline",
          objective: "OUTCOME_TRAFFIC",
          daily_budget: 5000,
          ad_sets: [
            {
              name: "Ad Set Inline",
              optimization_goal: "LINK_CLICKS",
              billing_event: "IMPRESSIONS",
              targeting: {
                geo_locations: { countries: ["US"] },
                age_min: 25,
                age_max: 65,
              },
              ads: [
                {
                  name: "Ad Inline",
                  creative: {
                    name: "Inline Creative",
                    object_story_spec: {
                      page_id: "123",
                      link_data: { link: "https://example.com" },
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const client = {
      createAdCreative: vi.fn().mockResolvedValue({ id: "cr_inline_1" }),
      createCampaign: vi.fn().mockResolvedValue({ id: "camp_inline_1" }),
      createAdSet: vi.fn().mockResolvedValue({ id: "adset_inline_1" }),
      createAd: vi.fn().mockRejectedValue(new Error("ad failed")),
    } as unknown as MetaClient;

    const result = await executeBatch(client, "act_123", config);

    expect(result.completed).toBe(false);
    expect(result.error?.tier).toBe("ads");
    expect(result.error?.rollback_hints).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Meta ad creatives cannot be deleted after creation",
        ),
      ]),
    );
    expect(result.created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "creative",
          id: "cr_inline_1",
          name: "Inline Creative",
        }),
      ]),
    );
  });

  it("injects image_hash from image_hashes map into shared creative object_story_spec", async () => {
    const config = buildValidConfig();
    config.image_hashes = { hero_image: "hash_hero_1" };
    config.shared_creatives = [
      {
        ref: "hero",
        name: "Hero Creative",
        image_key: "hero_image",
        object_story_spec: {
          page_id: "123",
          link_data: {
            link: "https://example.com",
          },
        },
      },
    ];

    const createAdCreative = vi.fn().mockResolvedValue({ id: "cr_1" });
    const client = {
      createAdCreative,
      createCampaign: vi.fn().mockResolvedValue({ id: "camp_1" }),
      createAdSet: vi.fn().mockResolvedValue({ id: "adset_1" }),
      createAd: vi.fn().mockResolvedValue({ id: "ad_1" }),
    } as unknown as MetaClient;

    const result = await executeBatch(client, "act_123", config);

    expect(result.completed).toBe(true);
    const creativePayload = createAdCreative.mock.calls[0]?.[1] as {
      object_story_spec?: { link_data?: { image_hash?: string } };
    };
    expect(creativePayload.object_story_spec?.link_data?.image_hash).toBe(
      "hash_hero_1",
    );
  });

  it("builds object_story_spec from copy-template creative fields", async () => {
    const config: BatchCampaignConfig = {
      image_hashes: { hero_image: "hash_hero_template" },
      creatives: [
        {
          ref: "hero-template",
          name: "Hero Template",
          page_id: "123",
          link: "https://example.com/tickets",
          message: "Join us this weekend",
          title: "Spring Show",
          call_to_action_type: "BUY_TICKETS",
          image_key: "hero_image",
        },
      ],
      campaigns: [
        {
          name: "Campaign Template",
          objective: "OUTCOME_TRAFFIC",
          daily_budget: 5000,
          ad_sets: [
            {
              name: "Ad Set Template",
              optimization_goal: "LINK_CLICKS",
              billing_event: "IMPRESSIONS",
              targeting: {
                geo_locations: { countries: ["US"] },
                age_min: 25,
                age_max: 65,
              },
              ads: [{ name: "Ad Template", creative_ref: "hero-template" }],
            },
          ],
        },
      ],
    };

    const createAdCreative = vi.fn().mockResolvedValue({ id: "cr_1" });
    const client = {
      createAdCreative,
      createCampaign: vi.fn().mockResolvedValue({ id: "camp_1" }),
      createAdSet: vi.fn().mockResolvedValue({ id: "adset_1" }),
      createAd: vi.fn().mockResolvedValue({ id: "ad_1" }),
    } as unknown as MetaClient;

    const result = await executeBatch(client, "act_123", config);
    expect(result.completed).toBe(true);

    const payload = createAdCreative.mock.calls[0]?.[1] as {
      object_story_spec?: {
        page_id?: string;
        link_data?: {
          link?: string;
          message?: string;
          name?: string;
          image_hash?: string;
        };
      };
    };
    expect(payload.object_story_spec?.page_id).toBe("123");
    expect(payload.object_story_spec?.link_data?.link).toBe(
      "https://example.com/tickets",
    );
    expect(payload.object_story_spec?.link_data?.message).toBe(
      "Join us this weekend",
    );
    expect(payload.object_story_spec?.link_data?.name).toBe("Spring Show");
    expect(payload.object_story_spec?.link_data?.image_hash).toBe(
      "hash_hero_template",
    );
  });
});
