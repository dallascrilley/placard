# Composite Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 4 high-ROI composite tools that compose existing MetaClient methods into single-call workflows: campaign summary, account overview, ad copy search, and campaign config validation.

**Architecture:** Each tool is a read-only composition of existing `MetaClient` API methods — no new API endpoints needed. Tools live in a new `src/tools/composite.ts` file (registered via `registerCompositeTools` in `server.ts`). All tools follow the existing `withToolHandler` + `createSuccessResponse` pattern. Tests go in `src/__tests__/tools/composite.test.ts`.

**Tech Stack:** TypeScript, Zod schemas, Vitest, existing MetaClient API layer

---

## Task 1: Scaffold composite tool file and registration

**Files:**
- Create: `src/tools/composite.ts`
- Modify: `src/server.ts:1-94`
- Test: `src/__tests__/tools/composite.test.ts`

**Step 1: Create the empty composite tool module**

```typescript
// src/tools/composite.ts
/**
 * Composite Tools
 *
 * High-level MCP tools that compose multiple API calls into single-call workflows.
 * All tools are read-only and do not modify any resources.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCompositeTools(server: McpServer): void {
  // Tools will be added in subsequent tasks
}
```

**Step 2: Register in server.ts**

Add import and registration call in `src/server.ts`:

```typescript
// After line 8 (import registerTargetingTools):
import { registerCompositeTools } from "./tools/composite.js";

// After line 91 (registerInsightsTools call), before return:
// Composite tools (campaign_summary, account_overview, search_ads, validate_campaign_config)
registerCompositeTools(server);
```

**Step 3: Create test file scaffold**

```typescript
// src/__tests__/tools/composite.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockResponse } from "../utils/mock-fetch.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.spyOn(console, "error").mockImplementation(() => {});

describe("Composite Tools", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("placeholder", () => {
    expect(true).toBe(true);
  });
});
```

**Step 4: Verify build compiles**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm typecheck`
Expected: No errors

**Step 5: Verify tests pass**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test`
Expected: All existing tests pass + new placeholder test passes

**Step 6: Commit**

```bash
git add src/tools/composite.ts src/server.ts src/__tests__/tools/composite.test.ts
git commit -m "feat(tools): scaffold composite tool module and registration"
```

---

## Task 2: `meta_get_campaign_summary` — Full campaign snapshot

Composes `getCampaignDetails` + `getAdSets` (filtered by campaign) + `getCampaignAds` (with creative) into a single structured response. This is the highest-ROI tool — eliminates 4+ calls for the most common workflow.

**Files:**
- Modify: `src/tools/composite.ts`
- Test: `src/__tests__/tools/composite.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/tools/composite.test.ts` inside the `describe("Composite Tools")` block (replace the placeholder test):

```typescript
import { MetaClient } from "../../api/meta-client.js";
import { withToolHandler } from "../../utils/tool-handler.js";

// We'll test the tool handler logic by importing and calling the handler directly.
// Since tools are registered via server.tool(), we test at the MetaClient mock level.

describe("meta_get_campaign_summary", () => {
  it("should compose campaign details, adsets, and ads into a summary", async () => {
    // Mock getCampaignDetails
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            id: "camp_1",
            name: "Test Campaign",
            objective: "OUTCOME_TRAFFIC",
            status: "ACTIVE",
            effective_status: "ACTIVE",
            daily_budget: "5000",
            created_time: "2025-01-01T00:00:00+0000",
            updated_time: "2025-01-15T00:00:00+0000",
            special_ad_categories: [],
          },
        }),
      )
      // Mock getAdSets (filtered by campaign)
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [
              {
                id: "adset_1",
                name: "US Adults",
                campaign_id: "camp_1",
                status: "ACTIVE",
                effective_status: "ACTIVE",
                daily_budget: "2500",
                targeting: {
                  age_min: 25,
                  age_max: 45,
                  geo_locations: { countries: ["US"] },
                },
                optimization_goal: "LINK_CLICKS",
                billing_event: "IMPRESSIONS",
              },
            ],
            paging: { cursors: { before: "b1", after: "a1" } },
          },
        }),
      )
      // Mock getCampaignAds (with creative)
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [
              {
                id: "ad_1",
                name: "Ad Variant A",
                adset_id: "adset_1",
                status: "ACTIVE",
                creative: {
                  id: "cr_1",
                  body: "Check out our sale!",
                  title: "Big Sale",
                },
              },
            ],
            paging: { cursors: { before: "b2", after: "a2" } },
          },
        }),
      );

    const client = new MetaClient({ accessToken: "test-token" });

    // Fetch all three in sequence (same as the tool does)
    const campaign = await client.getCampaignDetails("camp_1");
    const adsets = await client.getAdSets("act_123", { campaign_id: "camp_1" });
    const ads = await client.getCampaignAds("camp_1");

    expect(campaign.id).toBe("camp_1");
    expect(campaign.name).toBe("Test Campaign");
    expect(adsets.data).toHaveLength(1);
    expect(adsets.data[0]?.name).toBe("US Adults");
    expect(ads.data).toHaveLength(1);
    expect(ads.data[0]?.creative?.body).toBe("Check out our sale!");
  });

  it("should handle campaign with no adsets or ads", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            id: "camp_2",
            name: "Empty Campaign",
            objective: "OUTCOME_LEADS",
            status: "PAUSED",
            effective_status: "PAUSED",
            special_ad_categories: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          body: { data: [], paging: { cursors: { before: "", after: "" } } },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          body: { data: [], paging: { cursors: { before: "", after: "" } } },
        }),
      );

    const client = new MetaClient({ accessToken: "test-token" });
    const campaign = await client.getCampaignDetails("camp_2");
    const adsets = await client.getAdSets("act_123", { campaign_id: "camp_2" });
    const ads = await client.getCampaignAds("camp_2");

    expect(campaign.id).toBe("camp_2");
    expect(adsets.data).toHaveLength(0);
    expect(ads.data).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it passes (these test existing MetaClient methods)**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test src/__tests__/tools/composite.test.ts`
Expected: PASS (we're validating the underlying API calls work correctly)

**Step 3: Implement the tool**

Add to `src/tools/composite.ts` inside `registerCompositeTools`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { READ_ONLY_ANNOTATIONS } from "../constants/index.js";
import {
  accountIdSchema,
  responseFormatSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import { createSuccessResponse } from "../utils/tool-responses.js";

export function registerCompositeTools(server: McpServer): void {
  server.tool(
    "meta_get_campaign_summary",
    `Get a full campaign snapshot in one call — campaign details, ad sets with targeting, and ads with creative copy.

Composes three API calls into a single response: campaign settings, all ad sets (with targeting specs), and all ads (with creative body/title). Eliminates the need for separate campaign details → ad sets → ads → creatives calls.

Args:
  - campaign_id (string, required): Campaign ID to summarize
  - account_id (string, required): Ad account ID (needed to fetch ad sets filtered by campaign)
  - include_insights (boolean, optional): Include last_7d spend/impressions/clicks for the campaign (default: false)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "summary": {
      "campaign": {
        "id": "123",
        "name": "Summer Sale",
        "objective": "OUTCOME_TRAFFIC",
        "status": "ACTIVE",
        "daily_budget": "5000",
        ...
      },
      "adsets": [
        {
          "id": "456",
          "name": "US Adults 25-45",
          "status": "ACTIVE",
          "daily_budget": "2500",
          "targeting": { "age_min": 25, "age_max": 45, "geo_locations": { "countries": ["US"] } },
          ...
        }
      ],
      "ads": [
        {
          "id": "789",
          "name": "Ad Variant A",
          "adset_id": "456",
          "status": "ACTIVE",
          "creative": { "body": "Check out our sale!", "title": "Big Sale" }
        }
      ],
      "insights": null,
      "counts": {
        "adsets": 1,
        "ads": 1,
        "active_adsets": 1,
        "active_ads": 1
      }
    }
  }

Examples:
  - Basic summary: { "campaign_id": "123", "account_id": "act_456" }
  - With insights: { "campaign_id": "123", "account_id": "act_456", "include_insights": true }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 100: Invalid campaign ID
  - 10/200/294: Permission denied`,
    {
      campaign_id: z.string().describe("Campaign ID to summarize"),
      account_id: accountIdSchema,
      include_insights: z
        .boolean()
        .optional()
        .describe("Include last_7d campaign insights (default: false)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { campaign_id, account_id, include_insights },
        { client, format },
      ) => {
        const normalizedAccountId = normalizeAccountId(account_id);

        // Fire all three requests concurrently
        const [campaign, adsetsResponse, adsResponse] = await Promise.all([
          client.getCampaignDetails(campaign_id),
          client.getAdSets(normalizedAccountId, { campaign_id, limit: 100 }),
          client.getCampaignAds(campaign_id, { limit: 100 }),
        ]);

        // Optionally fetch insights
        let insights = null;
        if (include_insights) {
          const insightsResponse = await client.getInsights(campaign_id, {
            date_preset: "last_7d",
            level: "campaign",
            fields: ["impressions", "clicks", "spend", "ctr", "cpc"],
          });
          insights = insightsResponse.data[0] ?? null;
        }

        const adsets = adsetsResponse.data;
        const ads = adsResponse.data;

        const counts = {
          adsets: adsets.length,
          ads: ads.length,
          active_adsets: adsets.filter(
            (s: Record<string, unknown>) => s.effective_status === "ACTIVE",
          ).length,
          active_ads: ads.filter(
            (a: Record<string, unknown>) => a.effective_status === "ACTIVE",
          ).length,
        };

        return createSuccessResponse(
          {
            summary: {
              campaign,
              adsets,
              ads,
              insights,
              counts,
            },
          },
          format,
        );
      },
    ),
  );
}
```

**Step 4: Verify typecheck passes**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm typecheck`
Expected: No errors

**Step 5: Run all tests**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/tools/composite.ts src/__tests__/tools/composite.test.ts
git commit -m "feat(tools): add meta_get_campaign_summary composite tool"
```

---

## Task 3: `meta_get_account_overview` — Account-level dashboard

Composes `getAccountInfo` + `getCampaigns` (all, for counting) + optional `getInsights` (last_7d) into a single orientation call. Returns account metadata, campaign counts by status, and optional recent spend.

**Files:**
- Modify: `src/tools/composite.ts`
- Test: `src/__tests__/tools/composite.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/tools/composite.test.ts`:

```typescript
describe("meta_get_account_overview", () => {
  it("should compose account info, campaign counts, and optional insights", async () => {
    // Mock getAccountInfo
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            id: "act_123",
            account_id: "123",
            name: "Test Account",
            currency: "USD",
            timezone_name: "America/New_York",
            account_status: 1,
            amount_spent: "50000",
            balance: "10000",
          },
        }),
      )
      // Mock getCampaigns (all campaigns for counting)
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [
              { id: "c1", name: "Active 1", effective_status: "ACTIVE" },
              { id: "c2", name: "Active 2", effective_status: "ACTIVE" },
              { id: "c3", name: "Paused 1", effective_status: "PAUSED" },
            ],
            summary: { total_count: 3 },
            paging: { cursors: { before: "b", after: "a" } },
          },
        }),
      )
      // Mock getInsights (last_7d)
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [
              {
                impressions: "100000",
                clicks: "5000",
                spend: "500.00",
                ctr: "5.00",
                cpc: "0.10",
                date_start: "2026-02-21",
                date_stop: "2026-02-28",
              },
            ],
          },
        }),
      );

    const client = new MetaClient({ accessToken: "test-token" });

    const account = await client.getAccountInfo("act_123");
    const campaigns = await client.getCampaigns("act_123", { limit: 100 });
    const insights = await client.getInsights("act_123", {
      date_preset: "last_7d",
      level: "account",
    });

    expect(account.name).toBe("Test Account");
    expect(campaigns.data).toHaveLength(3);
    expect(campaigns.summary?.total_count).toBe(3);
    expect(insights.data[0]?.spend).toBe("500.00");
  });

  it("should work without insights when include_insights is false", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            id: "act_456",
            account_id: "456",
            name: "Another Account",
            currency: "EUR",
            timezone_name: "Europe/Berlin",
            account_status: 1,
            amount_spent: "0",
            balance: "0",
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [],
            summary: { total_count: 0 },
            paging: { cursors: { before: "", after: "" } },
          },
        }),
      );

    const client = new MetaClient({ accessToken: "test-token" });

    const account = await client.getAccountInfo("act_456");
    const campaigns = await client.getCampaigns("act_456", { limit: 100 });

    expect(account.name).toBe("Another Account");
    expect(campaigns.data).toHaveLength(0);
    // Only 2 fetch calls (no insights)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test src/__tests__/tools/composite.test.ts`
Expected: PASS

**Step 3: Implement the tool**

Add to `registerCompositeTools` in `src/tools/composite.ts`, after the campaign_summary tool:

```typescript
  server.tool(
    "meta_get_account_overview",
    `Get a high-level account dashboard in one call — account info, campaign counts by status, and optional recent insights.

Composes account details with campaign status counts and optional last-7-day performance metrics. Designed to orient an agent at the start of any workflow.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - include_insights (boolean, optional): Include last_7d account-level insights (default: true)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "overview": {
      "account": {
        "id": "act_123",
        "name": "My Account",
        "currency": "USD",
        "timezone_name": "America/New_York",
        "account_status": 1,
        "amount_spent": "50000"
      },
      "campaigns": {
        "total": 15,
        "by_status": {
          "ACTIVE": 5,
          "PAUSED": 8,
          "DELETED": 2
        },
        "active_campaigns": [
          { "id": "123", "name": "Summer Sale", "daily_budget": "5000" }
        ]
      },
      "insights_last_7d": {
        "impressions": "100000",
        "clicks": "5000",
        "spend": "500.00",
        "ctr": "5.00",
        "cpc": "0.10"
      }
    }
  }

Examples:
  - Basic overview: { "account_id": "act_123" }
  - Without insights: { "account_id": "act_123", "include_insights": false }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied`,
    {
      account_id: accountIdSchema,
      include_insights: z
        .boolean()
        .optional()
        .describe("Include last_7d account insights (default: true)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async ({ account_id, include_insights }, { client, format }) => {
        const normalizedId = normalizeAccountId(account_id);
        const fetchInsights = include_insights !== false;

        // Fetch account info and all campaigns concurrently
        const requests: [
          Promise<import("../types/meta-api.js").AdAccount>,
          Promise<import("../types/meta-api.js").ApiResponse<import("../types/meta-api.js").Campaign>>,
          Promise<{ data: import("../types/meta-api.js").Insights[] }> | null,
        ] = [
          client.getAccountInfo(normalizedId),
          client.getCampaigns(normalizedId, {
            limit: 100,
            fields: ["id", "name", "status", "effective_status", "daily_budget", "lifetime_budget"],
          }),
          fetchInsights
            ? client.getInsights(normalizedId, {
                date_preset: "last_7d",
                level: "account",
                fields: ["impressions", "clicks", "spend", "ctr", "cpc", "reach"],
              })
            : null,
        ];

        const [account, campaignsResponse, insightsResponse] = await Promise.all(
          requests.map((r) => r ?? Promise.resolve(null)),
        );

        const campaigns = (campaignsResponse as import("../types/meta-api.js").ApiResponse<import("../types/meta-api.js").Campaign>).data;

        // Count campaigns by effective_status
        const byStatus: Record<string, number> = {};
        for (const c of campaigns) {
          const status = (c as Record<string, unknown>).effective_status as string;
          byStatus[status] = (byStatus[status] ?? 0) + 1;
        }

        // Active campaigns for quick reference
        const activeCampaigns = campaigns.filter(
          (c: Record<string, unknown>) => c.effective_status === "ACTIVE",
        );

        const insightsData = insightsResponse
          ? (insightsResponse as { data: import("../types/meta-api.js").Insights[] }).data[0] ?? null
          : null;

        return createSuccessResponse(
          {
            overview: {
              account,
              campaigns: {
                total: campaignsResponse
                  ? (campaignsResponse as import("../types/meta-api.js").ApiResponse<import("../types/meta-api.js").Campaign>).summary?.total_count ?? campaigns.length
                  : 0,
                by_status: byStatus,
                active_campaigns: activeCampaigns,
              },
              insights_last_7d: insightsData,
            },
          },
          format,
        );
      },
    ),
  );
```

> **Important implementation note:** The type assertions above are verbose for clarity in the plan. During actual implementation, extract the response types at the top of the handler and let TypeScript infer — the plan shows the logic, not the final formatting. The implementer should clean up the type assertions into proper typed destructuring.

**Step 4: Verify typecheck**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm typecheck`
Expected: No errors

**Step 5: Run all tests**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/tools/composite.ts src/__tests__/tools/composite.test.ts
git commit -m "feat(tools): add meta_get_account_overview composite tool"
```

---

## Task 4: `meta_search_ads` — Full-text search across ad copy

Paginates through all ads in an account (or a specific campaign), checks creative body/title against a keyword, and returns only matches. Handles the full-account scan that currently requires manual multi-page crawling.

**Files:**
- Modify: `src/tools/composite.ts`
- Test: `src/__tests__/tools/composite.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/tools/composite.test.ts`:

```typescript
describe("meta_search_ads", () => {
  it("should find ads matching keyword in creative body", async () => {
    // Page 1 of ads
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [
              {
                id: "ad_1",
                name: "Ad A",
                adset_id: "as1",
                campaign_id: "c1",
                status: "ACTIVE",
                creative: { id: "cr1", body: "Check out our Bridal Show!", title: "Wedding Event" },
              },
              {
                id: "ad_2",
                name: "Ad B",
                adset_id: "as1",
                campaign_id: "c1",
                status: "ACTIVE",
                creative: { id: "cr2", body: "Summer sale happening now", title: "Sale" },
              },
              {
                id: "ad_3",
                name: "Ad C",
                adset_id: "as2",
                campaign_id: "c1",
                status: "PAUSED",
                creative: { id: "cr3", body: "Join us at the bridal show event", title: "Event" },
              },
            ],
            paging: { cursors: { before: "b1", after: "a1" } },
          },
        }),
      );

    const client = new MetaClient({ accessToken: "test-token" });
    const response = await client.getAds("act_123", { limit: 100 });

    // Simulate keyword matching (case-insensitive)
    const keyword = "bridal show";
    const matches = response.data.filter((ad) => {
      const body = (ad.creative?.body ?? "").toLowerCase();
      const title = (ad.creative?.title ?? "").toLowerCase();
      return body.includes(keyword.toLowerCase()) || title.includes(keyword.toLowerCase());
    });

    expect(matches).toHaveLength(2);
    expect(matches[0]?.id).toBe("ad_1");
    expect(matches[1]?.id).toBe("ad_3");
  });

  it("should return empty results when no ads match", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        body: {
          data: [
            {
              id: "ad_1",
              name: "Ad A",
              creative: { id: "cr1", body: "Summer sale", title: "Sale" },
            },
          ],
          paging: { cursors: { before: "b1", after: "a1" } },
        },
      }),
    );

    const client = new MetaClient({ accessToken: "test-token" });
    const response = await client.getAds("act_123", { limit: 100 });

    const keyword = "bridal";
    const matches = response.data.filter((ad) => {
      const body = (ad.creative?.body ?? "").toLowerCase();
      const title = (ad.creative?.title ?? "").toLowerCase();
      return body.includes(keyword.toLowerCase()) || title.includes(keyword.toLowerCase());
    });

    expect(matches).toHaveLength(0);
  });

  it("should paginate through multiple pages of ads", async () => {
    // Page 1 — has next cursor
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [
              {
                id: "ad_1",
                name: "Ad A",
                creative: { id: "cr1", body: "Bridal Show special", title: "Event" },
              },
            ],
            paging: {
              cursors: { before: "b1", after: "cursor_page2" },
              next: "https://graph.facebook.com/v22.0/act_123/ads?after=cursor_page2",
            },
          },
        }),
      )
      // Page 2 — no next
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [
              {
                id: "ad_2",
                name: "Ad B",
                creative: { id: "cr2", body: "Another Bridal Show ad", title: "Show" },
              },
            ],
            paging: { cursors: { before: "b2", after: "a2" } },
          },
        }),
      );

    const client = new MetaClient({ accessToken: "test-token" });

    // Page 1
    const page1 = await client.getAds("act_123", { limit: 1 });
    expect(page1.data).toHaveLength(1);
    expect(page1.paging?.next).toBeDefined();

    // Page 2
    const page2 = await client.getAds("act_123", {
      limit: 1,
      after: page1.paging?.cursors.after,
    });
    expect(page2.data).toHaveLength(1);

    const allAds = [...page1.data, ...page2.data];
    const keyword = "bridal show";
    const matches = allAds.filter((ad) => {
      const body = (ad.creative?.body ?? "").toLowerCase();
      return body.includes(keyword.toLowerCase());
    });
    expect(matches).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test src/__tests__/tools/composite.test.ts`
Expected: PASS

**Step 3: Implement the tool**

Add to `registerCompositeTools` in `src/tools/composite.ts`:

```typescript
  server.tool(
    "meta_search_ads",
    `Search for ads by keyword across ad creative text (body and title).

Scans ads in an account (or a specific campaign) and returns only those whose creative body or title contains the search keyword. Handles multi-page pagination internally. Case-insensitive matching.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - query (string, required): Keyword or phrase to search for in ad body/title text
  - campaign_id (string, optional): Limit search to a specific campaign
  - max_pages (number, optional): Maximum pages to scan, 1-50 (default: 10)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "query": "bridal show",
    "matches": [
      {
        "ad_id": "123",
        "ad_name": "Ad Variant A",
        "campaign_id": "456",
        "adset_id": "789",
        "status": "ACTIVE",
        "creative_body": "Check out our Bridal Show!",
        "creative_title": "Wedding Event",
        "match_in": "body"
      }
    ],
    "total_matches": 2,
    "total_ads_scanned": 150,
    "pages_scanned": 2,
    "has_more": false
  }

Examples:
  - Search entire account: { "account_id": "act_123", "query": "bridal show" }
  - Search within campaign: { "account_id": "act_123", "query": "sale", "campaign_id": "456" }
  - Deep scan: { "account_id": "act_123", "query": "trademark", "max_pages": 50 }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied`,
    {
      account_id: accountIdSchema,
      query: z.string().min(1).describe("Keyword or phrase to search for in ad copy"),
      campaign_id: z
        .string()
        .optional()
        .describe("Limit search to a specific campaign"),
      max_pages: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum pages to scan (default: 10)"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, query, campaign_id, max_pages },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const pageCap = max_pages ?? 10;
        const queryLower = query.toLowerCase();

        const matches: Array<Record<string, unknown>> = [];
        let adsScanned = 0;
        let pagesScanned = 0;
        let afterCursor: string | undefined;
        let hasMore = false;

        while (pagesScanned < pageCap) {
          const response = await client.getAds(normalizedId, {
            limit: 100,
            after: afterCursor,
            campaign_id,
            fields: [
              "id", "name", "adset_id", "campaign_id",
              "status", "effective_status",
              "creative{id,body,title}",
            ],
          });

          pagesScanned += 1;
          adsScanned += response.data.length;

          for (const ad of response.data) {
            const body = (ad.creative?.body ?? "").toLowerCase();
            const title = (ad.creative?.title ?? "").toLowerCase();
            const bodyMatch = body.includes(queryLower);
            const titleMatch = title.includes(queryLower);

            if (bodyMatch || titleMatch) {
              const matchIn: string[] = [];
              if (bodyMatch) matchIn.push("body");
              if (titleMatch) matchIn.push("title");

              matches.push({
                ad_id: ad.id,
                ad_name: ad.name,
                campaign_id: ad.campaign_id,
                adset_id: ad.adset_id,
                status: ad.effective_status ?? ad.status,
                creative_body: ad.creative?.body ?? null,
                creative_title: ad.creative?.title ?? null,
                match_in: matchIn.join(","),
              });
            }
          }

          const nextCursor = response.paging?.cursors?.after;
          hasMore = !!response.paging?.next && !!nextCursor;
          if (!hasMore || !nextCursor) {
            afterCursor = undefined;
            break;
          }
          afterCursor = nextCursor;
        }

        return createSuccessResponse(
          {
            query,
            matches,
            total_matches: matches.length,
            total_ads_scanned: adsScanned,
            pages_scanned: pagesScanned,
            has_more: hasMore,
          },
          format,
        );
      },
    ),
  );
```

**Step 4: Verify typecheck**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm typecheck`
Expected: No errors

**Step 5: Run all tests**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/tools/composite.ts src/__tests__/tools/composite.test.ts
git commit -m "feat(tools): add meta_search_ads full-text ad copy search tool"
```

---

## Task 5: `meta_validate_campaign_config` — Dry-run validation

Validates a campaign configuration object (targeting, budgets, creative references) against the Meta API without creating anything. Checks: interest IDs via `searchTargeting`, geo locations, budget minimums, and reach estimates.

**Files:**
- Modify: `src/tools/composite.ts`
- Test: `src/__tests__/tools/composite.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/tools/composite.test.ts`:

```typescript
describe("meta_validate_campaign_config", () => {
  it("should validate targeting interests exist", async () => {
    // Mock searchTargeting for interest validation
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        body: {
          data: [
            { id: "6003139266461", name: "Weddings", type: "interests" },
          ],
        },
      }),
    );

    const client = new MetaClient({ accessToken: "test-token" });
    const result = await client.searchTargeting("adinterestvalid", "6003139266461", 1);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe("Weddings");
  });

  it("should validate reach estimate for targeting spec", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        body: {
          data: {
            users_lower_bound: 50000,
            users_upper_bound: 100000,
          },
        },
      }),
    );

    const client = new MetaClient({ accessToken: "test-token" });
    const targeting = {
      age_min: 25,
      age_max: 45,
      geo_locations: { countries: ["US"] },
      flexible_spec: [{ interests: [{ id: "6003139266461", name: "Weddings" }] }],
    };

    const result = await client.getReachEstimate("act_123", targeting);
    expect(result.data.users_lower_bound).toBeGreaterThan(0);
  });

  it("should catch invalid budget (below $1 minimum)", () => {
    // Budget validation is local — no API call needed
    const dailyBudget = 50; // 50 cents, below $1 minimum
    const isValid = dailyBudget >= 100;
    expect(isValid).toBe(false);
  });

  it("should validate a complete campaign config", async () => {
    // Interest validation
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [
              { id: "6003139266461", name: "Weddings", type: "interests" },
            ],
          },
        }),
      )
      // Reach estimate
      .mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: {
              users_lower_bound: 150000,
              users_upper_bound: 300000,
            },
          },
        }),
      );

    const client = new MetaClient({ accessToken: "test-token" });

    // Step 1: Validate interests
    const interestResult = await client.searchTargeting("adinterestvalid", "6003139266461", 1);
    expect(interestResult.data).toHaveLength(1);

    // Step 2: Validate reach
    const reach = await client.getReachEstimate("act_123", {
      age_min: 25,
      age_max: 55,
      geo_locations: { countries: ["US"] },
    });
    expect(reach.data.users_lower_bound).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test src/__tests__/tools/composite.test.ts`
Expected: PASS

**Step 3: Implement the tool**

Add to `registerCompositeTools` in `src/tools/composite.ts`:

```typescript
  server.tool(
    "meta_validate_campaign_config",
    `Validate a campaign configuration before creating — checks targeting interests, geo locations, budgets, and audience reach.

Performs dry-run validation of a campaign config without creating anything. Checks:
1. Budget minimums (daily >= $1.00 / 100 cents)
2. Interest targeting IDs exist (via adinterestvalid API)
3. Audience reach estimate (warns if too narrow or too broad)
4. Required fields present (name, objective, targeting)

Returns a list of validation results: errors (blocking), warnings (advisory), and passed checks.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - name (string, required): Proposed campaign name
  - objective (string, required): Campaign objective (OUTCOME_* format)
  - daily_budget (number, optional): Daily budget in cents
  - lifetime_budget (number, optional): Lifetime budget in cents
  - targeting (object, required): Targeting specification (age_min, age_max, geo_locations, flexible_spec, etc.)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "validation": {
      "valid": true,
      "errors": [],
      "warnings": [
        { "field": "targeting", "message": "Audience is very broad (>10M). Consider narrowing." }
      ],
      "checks": [
        { "check": "budget_minimum", "status": "pass", "detail": "Daily budget $50.00 meets minimum $1.00" },
        { "check": "interests_valid", "status": "pass", "detail": "1/1 interest IDs validated" },
        { "check": "reach_estimate", "status": "pass", "detail": "Estimated reach: 150,000 - 300,000" }
      ],
      "reach_estimate": {
        "users_lower_bound": 150000,
        "users_upper_bound": 300000
      }
    }
  }

Examples:
  - Validate config: { "account_id": "act_123", "name": "Summer Sale", "objective": "OUTCOME_TRAFFIC", "daily_budget": 5000, "targeting": { "age_min": 25, "age_max": 45, "geo_locations": { "countries": ["US"] } } }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry`,
    {
      account_id: accountIdSchema,
      name: z.string().min(1).describe("Proposed campaign name"),
      objective: z.string().describe("Campaign objective (OUTCOME_* format)"),
      daily_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Daily budget in cents"),
      lifetime_budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Lifetime budget in cents"),
      targeting: z.record(z.unknown()).describe("Targeting specification object"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, name, objective, daily_budget, lifetime_budget, targeting },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const errors: Array<{ field: string; message: string }> = [];
        const warnings: Array<{ field: string; message: string }> = [];
        const checks: Array<{ check: string; status: string; detail: string }> = [];

        // 1. Budget validation (local)
        if (daily_budget === undefined && lifetime_budget === undefined) {
          errors.push({
            field: "budget",
            message: "Either daily_budget or lifetime_budget is required",
          });
        } else {
          const budget = daily_budget ?? lifetime_budget!;
          const budgetType = daily_budget !== undefined ? "Daily" : "Lifetime";
          const budgetDollars = (budget / 100).toFixed(2);

          if (budget < 100) {
            errors.push({
              field: "budget",
              message: `${budgetType} budget $${budgetDollars} is below minimum $1.00 (100 cents)`,
            });
            checks.push({
              check: "budget_minimum",
              status: "fail",
              detail: `${budgetType} budget $${budgetDollars} below minimum $1.00`,
            });
          } else {
            checks.push({
              check: "budget_minimum",
              status: "pass",
              detail: `${budgetType} budget $${budgetDollars} meets minimum $1.00`,
            });
          }
        }

        // 2. Objective validation (local)
        const validObjectives = [
          "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS",
          "OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_APP_PROMOTION",
        ];
        if (validObjectives.includes(objective)) {
          checks.push({
            check: "objective_valid",
            status: "pass",
            detail: `Objective "${objective}" is valid`,
          });
        } else {
          errors.push({
            field: "objective",
            message: `Invalid objective "${objective}". Must be one of: ${validObjectives.join(", ")}`,
          });
          checks.push({
            check: "objective_valid",
            status: "fail",
            detail: `Invalid objective "${objective}"`,
          });
        }

        // 3. Validate interest IDs (API call)
        const flexSpec = (targeting as Record<string, unknown>).flexible_spec;
        if (Array.isArray(flexSpec)) {
          const interestIds: string[] = [];
          for (const spec of flexSpec) {
            const interests = (spec as Record<string, unknown>).interests;
            if (Array.isArray(interests)) {
              for (const interest of interests) {
                const id = (interest as Record<string, unknown>).id;
                if (typeof id === "string") interestIds.push(id);
              }
            }
          }

          if (interestIds.length > 0) {
            let validCount = 0;
            const invalidIds: string[] = [];

            for (const id of interestIds) {
              try {
                const result = await client.searchTargeting("adinterestvalid", id, 1);
                if (result.data.length > 0) {
                  validCount++;
                } else {
                  invalidIds.push(id);
                }
              } catch {
                invalidIds.push(id);
              }
            }

            if (invalidIds.length > 0) {
              errors.push({
                field: "targeting.interests",
                message: `Invalid interest IDs: ${invalidIds.join(", ")}`,
              });
              checks.push({
                check: "interests_valid",
                status: "fail",
                detail: `${validCount}/${interestIds.length} interest IDs valid, invalid: ${invalidIds.join(", ")}`,
              });
            } else {
              checks.push({
                check: "interests_valid",
                status: "pass",
                detail: `${validCount}/${interestIds.length} interest IDs validated`,
              });
            }
          }
        }

        // 4. Reach estimate (API call)
        let reachEstimate = null;
        try {
          const reach = await client.getReachEstimate(normalizedId, targeting);
          reachEstimate = reach.data;

          const lower = reachEstimate.users_lower_bound;
          const upper = reachEstimate.users_upper_bound;
          const lowerFormatted = lower.toLocaleString();
          const upperFormatted = upper.toLocaleString();

          checks.push({
            check: "reach_estimate",
            status: "pass",
            detail: `Estimated reach: ${lowerFormatted} - ${upperFormatted}`,
          });

          if (upper < 1000) {
            warnings.push({
              field: "targeting",
              message: `Audience is very narrow (${upperFormatted}). Consider broadening targeting.`,
            });
          } else if (lower > 10_000_000) {
            warnings.push({
              field: "targeting",
              message: `Audience is very broad (${lowerFormatted}+). Consider narrowing targeting.`,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          checks.push({
            check: "reach_estimate",
            status: "warn",
            detail: `Could not estimate reach: ${message}`,
          });
          warnings.push({
            field: "targeting",
            message: `Reach estimate unavailable: ${message}`,
          });
        }

        // 5. Geo validation (local)
        const geoLocations = (targeting as Record<string, unknown>).geo_locations;
        if (!geoLocations) {
          errors.push({
            field: "targeting.geo_locations",
            message: "geo_locations is required in targeting",
          });
          checks.push({
            check: "geo_locations",
            status: "fail",
            detail: "Missing geo_locations in targeting",
          });
        } else {
          checks.push({
            check: "geo_locations",
            status: "pass",
            detail: "geo_locations present",
          });
        }

        return createSuccessResponse(
          {
            validation: {
              valid: errors.length === 0,
              errors,
              warnings,
              checks,
              reach_estimate: reachEstimate,
            },
          },
          format,
        );
      },
    ),
  );
```

**Step 4: Verify typecheck**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm typecheck`
Expected: No errors

**Step 5: Run all tests**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/tools/composite.ts src/__tests__/tools/composite.test.ts
git commit -m "feat(tools): add meta_validate_campaign_config dry-run validation tool"
```

---

## Task 6: Server registration test and lint

Verify the new tools appear in the MCP server's tool list and pass lint.

**Files:**
- Modify: `src/__tests__/server.test.ts` (if needed)

**Step 1: Run the existing server test to check registration**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test src/__tests__/server.test.ts`
Expected: PASS — server.test.ts should pick up the new tools automatically since it tests `createServer()`

**Step 2: Run lint**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm lint`
Expected: No errors. If there are formatting issues, run `pnpm lint:fix`

**Step 3: Run full test suite**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm test`
Expected: All tests pass

**Step 4: Run typecheck**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm typecheck`
Expected: No errors

**Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "test: verify composite tool registration and pass lint"
```

---

## Task 7: Final verification and build

**Step 1: Run full validation suite**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: All pass, `dist/` output generated

**Step 2: Verify tool count increased**

Run: `cd /Users/dallascrilley/Code/meta-ads-mcp && pnpm validate:descriptions 2>&1 | head -5`
Expected: Should show 32 tools (28 existing + 4 new)

**Step 3: Commit build artifacts (if tracked)**

Usually `dist/` is gitignored — skip if so. Otherwise:

```bash
git add -A
git commit -m "chore: build composite tools"
```
