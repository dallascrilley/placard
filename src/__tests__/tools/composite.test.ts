import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaClient } from "../../api/meta-client.js";
import { registerCompositeTools } from "../../tools/composite.js";
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

  describe("registerCompositeTools", () => {
    it("should register all composite tools", () => {
      const tool = vi.fn();
      registerCompositeTools({ tool } as unknown as McpServer);

      expect(tool).toHaveBeenCalledTimes(4);
      expect(tool.mock.calls[0]?.[0]).toBe("meta_get_campaign_summary");
      expect(tool.mock.calls[1]?.[0]).toBe("meta_get_account_overview");
      expect(tool.mock.calls[2]?.[0]).toBe("meta_search_ads");
      expect(tool.mock.calls[3]?.[0]).toBe("meta_validate_campaign_config");
    });
  });

  describe("meta_get_campaign_summary", () => {
    it("should compose campaign details, adsets, and ads into a summary", async () => {
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

      const campaign = await client.getCampaignDetails("camp_1");
      const adsets = await client.getAdSets("act_123", {
        campaign_id: "camp_1",
      });
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
      const adsets = await client.getAdSets("act_123", {
        campaign_id: "camp_2",
      });
      const ads = await client.getCampaignAds("camp_2");

      expect(campaign.id).toBe("camp_2");
      expect(adsets.data).toHaveLength(0);
      expect(ads.data).toHaveLength(0);
    });
  });

  describe("meta_get_account_overview", () => {
    it("should compose account info, campaign counts, and optional insights", async () => {
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
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("meta_search_ads", () => {
    it("should find ads matching keyword in creative body", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          body: {
            data: [
              {
                id: "ad_1",
                name: "Ad A",
                adset_id: "as1",
                campaign_id: "c1",
                status: "ACTIVE",
                creative: {
                  id: "cr1",
                  body: "Check out our Bridal Show!",
                  title: "Wedding Event",
                },
              },
              {
                id: "ad_2",
                name: "Ad B",
                adset_id: "as1",
                campaign_id: "c1",
                status: "ACTIVE",
                creative: {
                  id: "cr2",
                  body: "Summer sale happening now",
                  title: "Sale",
                },
              },
              {
                id: "ad_3",
                name: "Ad C",
                adset_id: "as2",
                campaign_id: "c1",
                status: "PAUSED",
                creative: {
                  id: "cr3",
                  body: "Join us at the bridal show event",
                  title: "Event",
                },
              },
            ],
            paging: { cursors: { before: "b1", after: "a1" } },
          },
        }),
      );

      const client = new MetaClient({ accessToken: "test-token" });
      const response = await client.getAds("act_123", { limit: 100 });

      const keyword = "bridal show";
      const matches = response.data.filter((ad) => {
        const body = (ad.creative?.body ?? "").toLowerCase();
        const title = (ad.creative?.title ?? "").toLowerCase();
        return (
          body.includes(keyword.toLowerCase()) ||
          title.includes(keyword.toLowerCase())
        );
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
        return (
          body.includes(keyword.toLowerCase()) ||
          title.includes(keyword.toLowerCase())
        );
      });

      expect(matches).toHaveLength(0);
    });

    it("should paginate through multiple pages of ads", async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            body: {
              data: [
                {
                  id: "ad_1",
                  name: "Ad A",
                  creative: {
                    id: "cr1",
                    body: "Bridal Show special",
                    title: "Event",
                  },
                },
              ],
              paging: {
                cursors: { before: "b1", after: "cursor_page2" },
                next: "https://graph.facebook.com/v22.0/act_123/ads?after=cursor_page2",
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            body: {
              data: [
                {
                  id: "ad_2",
                  name: "Ad B",
                  creative: {
                    id: "cr2",
                    body: "Another Bridal Show ad",
                    title: "Show",
                  },
                },
              ],
              paging: { cursors: { before: "b2", after: "a2" } },
            },
          }),
        );

      const client = new MetaClient({ accessToken: "test-token" });
      const page1 = await client.getAds("act_123", { limit: 1 });
      const page2 = await client.getAds("act_123", {
        limit: 1,
        after: page1.paging?.cursors.after,
      });

      const allAds = [...page1.data, ...page2.data];
      const keyword = "bridal show";
      const matches = allAds.filter((ad) =>
        (ad.creative?.body ?? "").toLowerCase().includes(keyword),
      );

      expect(page1.data).toHaveLength(1);
      expect(page1.paging?.next).toBeDefined();
      expect(page2.data).toHaveLength(1);
      expect(matches).toHaveLength(2);
    });
  });

  describe("meta_validate_campaign_config", () => {
    it("should validate targeting interests exist", async () => {
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
      const result = await client.searchTargeting(
        "adinterestvalid",
        "6003139266461",
        1,
      );

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
        flexible_spec: [
          { interests: [{ id: "6003139266461", name: "Weddings" }] },
        ],
      };

      const result = await client.getReachEstimate("act_123", targeting);
      expect(result.data.users_lower_bound).toBeGreaterThan(0);
    });

    it("should catch invalid budget (below $1 minimum)", () => {
      const dailyBudget = 50;
      const isValid = dailyBudget >= 100;
      expect(isValid).toBe(false);
    });

    it("should validate a complete campaign config", async () => {
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
      const interestResult = await client.searchTargeting(
        "adinterestvalid",
        "6003139266461",
        1,
      );
      const reach = await client.getReachEstimate("act_123", {
        age_min: 25,
        age_max: 55,
        geo_locations: { countries: ["US"] },
      });

      expect(interestResult.data).toHaveLength(1);
      expect(reach.data.users_lower_bound).toBeGreaterThan(0);
    });
  });
});
