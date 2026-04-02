import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaAuth } from "../../api/auth.js";
import {
  AuthenticationError,
  MetaApiError,
  RateLimitError,
} from "../../api/error-handling.js";
import { MetaClient, createMetaClient } from "../../api/meta-client.js";
import {
  createMetaErrorBody,
  createMockResponse,
} from "../utils/mock-fetch.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock fs.readFile for uploadAdImage filePath tests
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

// Mock console.error to avoid test output noise
vi.spyOn(console, "error").mockImplementation(() => {});

describe("MetaClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    MetaClient.resetRateLimiterStateForTests();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should use provided accessToken", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "test-token" });
      await client.getAdAccounts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("access_token=test-token"),
        expect.any(Object),
      );
    });

    it("should use default userId when not provided", async () => {
      const mockAuth = {
        getAccessTokenForUser: vi.fn().mockReturnValue("auth-token"),
        getAuthUrl: vi.fn(),
        exchangeCode: vi.fn(),
        logout: vi.fn(),
        checkAuthStatus: vi.fn(),
        debugToken: vi.fn(),
        getConfig: vi.fn(),
      } as unknown as MetaAuth;

      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ auth: mockAuth });
      await client.getAdAccounts();

      expect(mockAuth.getAccessTokenForUser).toHaveBeenCalledWith("default");
    });

    it("should use custom userId", async () => {
      const mockAuth = {
        getAccessTokenForUser: vi.fn().mockReturnValue("auth-token"),
        getAuthUrl: vi.fn(),
        exchangeCode: vi.fn(),
        logout: vi.fn(),
        checkAuthStatus: vi.fn(),
        debugToken: vi.fn(),
        getConfig: vi.fn(),
      } as unknown as MetaAuth;

      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ auth: mockAuth, userId: "user-123" });
      await client.getAdAccounts();

      expect(mockAuth.getAccessTokenForUser).toHaveBeenCalledWith("user-123");
    });

    it("should fall back to defaults for invalid rate-limit env values", async () => {
      const previousMin = process.env["META_API_MIN_REQUEST_INTERVAL_MS"];
      const previousCooldown = process.env["META_API_RATE_LIMIT_COOLDOWN_MS"];
      process.env["META_API_MIN_REQUEST_INTERVAL_MS"] = "";
      process.env["META_API_RATE_LIMIT_COOLDOWN_MS"] = "oops";

      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));
        const client = new MetaClient({ accessToken: "token" });

        const first = client.getAdAccounts();
        await vi.advanceTimersByTimeAsync(0);
        await first;
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const second = client.getAdAccounts();
        await vi.advanceTimersByTimeAsync(900);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(100);
        await second;
        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
        if (previousMin === undefined) {
          process.env["META_API_MIN_REQUEST_INTERVAL_MS"] = undefined;
        } else {
          process.env["META_API_MIN_REQUEST_INTERVAL_MS"] = previousMin;
        }
        if (previousCooldown === undefined) {
          process.env["META_API_RATE_LIMIT_COOLDOWN_MS"] = undefined;
        } else {
          process.env["META_API_RATE_LIMIT_COOLDOWN_MS"] = previousCooldown;
        }
      }
    });
  });

  describe("authentication", () => {
    it("should throw AuthenticationError when no token available", async () => {
      const mockAuth = {
        getAccessTokenForUser: vi.fn().mockReturnValue(null),
        getAuthUrl: vi.fn(),
        exchangeCode: vi.fn(),
        logout: vi.fn(),
        checkAuthStatus: vi.fn(),
        debugToken: vi.fn(),
        getConfig: vi.fn(),
      } as unknown as MetaAuth;

      const client = new MetaClient({ auth: mockAuth });

      await expect(client.getAdAccounts()).rejects.toThrow(AuthenticationError);
      await expect(client.getAdAccounts()).rejects.toThrow(
        "Not authenticated. Use get_login_link to authenticate.",
      );
    });

    it("should use accessToken over auth when provided", async () => {
      const mockAuth = {
        getAccessTokenForUser: vi.fn().mockReturnValue("auth-token"),
        getAuthUrl: vi.fn(),
        exchangeCode: vi.fn(),
        logout: vi.fn(),
        checkAuthStatus: vi.fn(),
        debugToken: vi.fn(),
        getConfig: vi.fn(),
      } as unknown as MetaAuth;

      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({
        accessToken: "direct-token",
        auth: mockAuth,
      });
      await client.getAdAccounts();

      expect(mockAuth.getAccessTokenForUser).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("access_token=direct-token"),
        expect.any(Object),
      );
    });
  });

  describe("request building", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));
    });

    it("should build URL with correct base and endpoint", async () => {
      const client = new MetaClient({ accessToken: "token" });
      await client.getAdAccounts();

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain(
        "https://graph.facebook.com/v22.0/me/adaccounts",
      );
    });

    it("should include access_token in query params", async () => {
      const client = new MetaClient({ accessToken: "my-token" });
      await client.getAdAccounts();

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("access_token=my-token");
    });

    it("should include fields parameter", async () => {
      const client = new MetaClient({ accessToken: "token" });
      await client.getAdAccounts();

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("fields=");
    });

    it("should include limit parameter", async () => {
      const client = new MetaClient({ accessToken: "token" });
      await client.getAdAccounts(50);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("limit=50");
    });

    it("should use GET method for read operations", async () => {
      const client = new MetaClient({ accessToken: "token" });
      await client.getAdAccounts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should use POST method for create/update operations", async () => {
      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Test Campaign",
        objective: "OUTCOME_SALES",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should include Content-Type header", async () => {
      const client = new MetaClient({ accessToken: "token" });
      await client.getAdAccounts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("should serialize body as JSON for POST requests", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Test Campaign",
        objective: "OUTCOME_SALES",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      expect(options.body).toBe(
        JSON.stringify({
          name: "Test Campaign",
          objective: "OUTCOME_SALES",
          status: "PAUSED",
          special_ad_categories: [],
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        }),
      );
    });
  });

  describe("error handling", () => {
    it("should throw MetaApiError on API error response", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          status: 400,
          body: createMetaErrorBody(190, "Invalid access token"),
        }),
      );

      const client = new MetaClient({ accessToken: "bad-token" });

      await expect(client.getAdAccounts()).rejects.toThrow(MetaApiError);
    });

    it("should parse error details correctly", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          status: 400,
          body: createMetaErrorBody(
            190,
            "Invalid access token",
            "OAuthException",
          ),
        }),
      );

      const client = new MetaClient({ accessToken: "bad-token" });

      try {
        await client.getAdAccounts();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(MetaApiError);
        const metaError = error as MetaApiError;
        expect(metaError.code).toBe(190);
        expect(metaError.message).toBe("Invalid access token");
        expect(metaError.type).toBe("OAuthException");
      }
    });
  });

  describe("getAdAccounts", () => {
    it("should return ad accounts data", async () => {
      const mockData = {
        data: [
          { id: "act_123", name: "Account 1" },
          { id: "act_456", name: "Account 2" },
        ],
      };

      mockFetch.mockResolvedValue(createMockResponse({ body: mockData }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.getAdAccounts();

      expect(result).toEqual(mockData);
    });

    it("should use default limit of 25", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdAccounts();

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("limit=25");
    });

    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdAccounts(25, ["id", "name"]);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("fields=id%2Cname");
    });

    it("should fall back to default fields when fields is empty", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdAccounts(25, []);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("account_status");
      expect(calledUrl).not.toContain("fields=&");
    });
  });

  describe("getAccountInfo", () => {
    it("should fetch account details", async () => {
      const mockAccount = { id: "act_123", name: "Test Account" };
      mockFetch.mockResolvedValue(createMockResponse({ body: mockAccount }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.getAccountInfo("act_123");

      expect(result).toEqual(mockAccount);
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123");
    });

    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "act_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.getAccountInfo("act_123", ["id", "name"]);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("fields=id%2Cname");
    });
  });

  describe("getCustomAudiences", () => {
    it("should fetch custom audiences for an account", async () => {
      const mockData = {
        data: [{ id: "ca_1", name: "Purchasers" }],
      };
      mockFetch.mockResolvedValue(createMockResponse({ body: mockData }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.getCustomAudiences("act_123");

      expect(result).toEqual(mockData);
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/customaudiences");
      expect(calledUrl).toContain("summary=true");
    });

    it("should pass cursor pagination params", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getCustomAudiences("act_123", {
        after: "after_cursor",
        before: "before_cursor",
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("after=after_cursor");
      expect(calledUrl).toContain("before=before_cursor");
    });

    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getCustomAudiences("act_123", { fields: ["id", "name"] });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("fields=id%2Cname");
    });
  });

  describe("createCustomAudience", () => {
    it("should create custom audience with required fields", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "ca_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.createCustomAudience("act_123", {
        name: "Purchasers 180d",
      });

      expect(result).toEqual({ id: "ca_123" });
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/customaudiences");

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.name).toBe("Purchasers 180d");
      expect(body.subtype).toBe("CUSTOM");
    });

    it("should include optional custom audience fields", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "ca_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.createCustomAudience("act_123", {
        name: "Website Visitors",
        subtype: "WEBSITE",
        retention_days: 30,
        rule: { event: { eq: "ViewContent" } },
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.subtype).toBe("WEBSITE");
      expect(body.retention_days).toBe(30);
      expect(body.rule).toEqual({ event: { eq: "ViewContent" } });
    });
  });

  describe("createLookalikeAudience", () => {
    it("should create lookalike audience with source and spec", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "la_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.createLookalikeAudience("act_123", {
        name: "LAL 1% Purchasers",
        origin_audience_id: "ca_source_1",
        lookalike_spec: { country: "US", ratio: 0.01 },
      });

      expect(result).toEqual({ id: "la_123" });
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/customaudiences");

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.subtype).toBe("LOOKALIKE");
      expect(body.origin_audience_id).toBe("ca_source_1");
      expect(body.lookalike_spec).toEqual({ country: "US", ratio: 0.01 });
    });
  });

  describe("getCampaigns", () => {
    it("should fetch campaigns for account", async () => {
      const mockData = {
        data: [{ id: "123", name: "Campaign 1" }],
      };
      mockFetch.mockResolvedValue(createMockResponse({ body: mockData }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.getCampaigns("act_123");

      expect(result).toEqual(mockData);
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/campaigns");
      expect(calledUrl).toContain("summary=true");
    });

    it("should apply status filter", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getCampaigns("act_123", { status: "ACTIVE" });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("filtering=");
      expect(calledUrl).toContain("ACTIVE");
    });

    it("should pass cursor pagination params", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getCampaigns("act_123", {
        after: "after_cursor",
        before: "before_cursor",
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("after=after_cursor");
      expect(calledUrl).toContain("before=before_cursor");
    });

    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getCampaigns("act_123", {
        fields: ["id", "name", "status"],
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("fields=id%2Cname%2Cstatus");
    });
  });

  describe("getCampaignDetails", () => {
    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "camp_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.getCampaignDetails("camp_123", ["id", "name", "status"]);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/camp_123");
      expect(calledUrl).toContain("fields=id%2Cname%2Cstatus");
    });
  });

  describe("createCampaign", () => {
    it("should create campaign with required fields", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "camp_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.createCampaign("act_123", {
        name: "New Campaign",
        objective: "OUTCOME_SALES",
      });

      expect(result).toEqual({ id: "camp_123" });
    });

    it("should default status to PAUSED", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Test",
        objective: "OUTCOME_SALES",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.status).toBe("PAUSED");
    });

    it("should include optional budgets when provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Test",
        objective: "OUTCOME_SALES",
        daily_budget: 5000,
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.daily_budget).toBe(5000);
    });

    it("should pass bid_strategy when provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Test",
        objective: "OUTCOME_SALES",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.bid_strategy).toBe("LOWEST_COST_WITHOUT_CAP");
    });

    it("should default bid_strategy to LOWEST_COST_WITHOUT_CAP when not provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Test",
        objective: "OUTCOME_SALES",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.bid_strategy).toBe("LOWEST_COST_WITHOUT_CAP");
    });

    it("should pass start_time and stop_time when provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Scheduled Campaign",
        objective: "OUTCOME_SALES",
        daily_budget: 5000,
        start_time: "2026-03-01T00:00:00+0000",
        stop_time: "2026-03-15T23:59:59+0000",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.start_time).toBe("2026-03-01T00:00:00+0000");
      expect(body.stop_time).toBe("2026-03-15T23:59:59+0000");
    });

    it("should pass promoted_object when provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Event Campaign",
        objective: "OUTCOME_ENGAGEMENT",
        daily_budget: 5000,
        promoted_object: { event_id: "event_789" },
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.promoted_object).toBe(
        JSON.stringify({ event_id: "event_789" }),
      );
    });

    it("should pass spend_cap when provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Capped Campaign",
        objective: "OUTCOME_SALES",
        daily_budget: 5000,
        spend_cap: 50000,
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.spend_cap).toBe(50000);
    });

    it("should not include spend_cap when not provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Test",
        objective: "OUTCOME_SALES",
        daily_budget: 5000,
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.spend_cap).toBeUndefined();
    });

    it("should pass special_ad_category_country when provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.createCampaign("act_123", {
        name: "Employment Campaign",
        objective: "OUTCOME_LEADS",
        daily_budget: 5000,
        special_ad_categories: ["EMPLOYMENT"],
        special_ad_category_country: ["US"],
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.special_ad_category_country).toEqual(["US"]);
    });
  });

  describe("updateCampaign", () => {
    it("should update campaign fields", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { success: true } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.updateCampaign("camp_123", {
        name: "Updated Name",
        status: "ACTIVE",
      });

      expect(result).toEqual({ success: true });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/camp_123");

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.name).toBe("Updated Name");
      expect(body.status).toBe("ACTIVE");
    });

    it("should only include provided fields", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { success: true } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.updateCampaign("camp_123", { status: "PAUSED" });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body).toEqual({ status: "PAUSED" });
      expect(body.name).toBeUndefined();
    });

    it("should pass bid_strategy when provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { success: true } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.updateCampaign("camp_123", {
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.bid_strategy).toBe("LOWEST_COST_WITHOUT_CAP");
    });

    it("should pass start_time and stop_time when provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { success: true } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.updateCampaign("camp_123", {
        stop_time: "2026-04-01T00:00:00+0000",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.stop_time).toBe("2026-04-01T00:00:00+0000");
    });

    it("should pass spend_cap when provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { success: true } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.updateCampaign("camp_123", { spend_cap: 25000 });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.spend_cap).toBe(25000);
    });
  });

  describe("getAdSets", () => {
    it("should fetch ad sets for account", async () => {
      const mockData = { data: [{ id: "adset_1" }] };
      mockFetch.mockResolvedValue(createMockResponse({ body: mockData }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.getAdSets("act_123");

      expect(result).toEqual(mockData);
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/adsets");
    });

    it("should filter by campaign_id", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdSets("act_123", { campaign_id: "camp_456" });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("filtering=");
      expect(calledUrl).toContain("camp_456");
    });

    it("should pass cursor pagination params", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdSets("act_123", {
        after: "after_cursor",
        before: "before_cursor",
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("after=after_cursor");
      expect(calledUrl).toContain("before=before_cursor");
    });

    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdSets("act_123", {
        fields: ["id", "name", "campaign_id"],
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("fields=id%2Cname%2Ccampaign_id");
    });
  });

  describe("createAdSet", () => {
    it("should pass promoted_object when provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "adset_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.createAdSet("act_123", {
        name: "Conversions Ad Set",
        campaign_id: "camp_123",
        optimization_goal: "OFFSITE_CONVERSIONS",
        billing_event: "IMPRESSIONS",
        targeting: { geo_locations: { countries: ["US"] } },
        promoted_object: {
          pixel_id: "pixel_456",
          custom_event_type: "PURCHASE",
        },
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(JSON.parse(body.promoted_object as string)).toEqual({
        pixel_id: "pixel_456",
        custom_event_type: "PURCHASE",
      });
    });

    it("should not include promoted_object when not provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "adset_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.createAdSet("act_123", {
        name: "Basic Ad Set",
        campaign_id: "camp_123",
        optimization_goal: "LINK_CLICKS",
        billing_event: "IMPRESSIONS",
        targeting: { geo_locations: { countries: ["US"] } },
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.promoted_object).toBeUndefined();
    });

    it("should pass destination_type when provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "adset_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.createAdSet("act_123", {
        name: "Call Ad Set",
        campaign_id: "camp_123",
        optimization_goal: "QUALITY_CALL",
        billing_event: "IMPRESSIONS",
        targeting: { geo_locations: { countries: ["US"] } },
        destination_type: "PHONE_CALL",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.destination_type).toBe("PHONE_CALL");
    });

    it("should pass is_dynamic_creative when provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "adset_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.createAdSet("act_123", {
        name: "DCO Ad Set",
        campaign_id: "camp_123",
        optimization_goal: "LINK_CLICKS",
        billing_event: "IMPRESSIONS",
        targeting: { geo_locations: { countries: ["US"] } },
        is_dynamic_creative: true,
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.is_dynamic_creative).toBe(true);
    });

    it("should pass pacing_type when provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "adset_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.createAdSet("act_123", {
        name: "Accelerated Ad Set",
        campaign_id: "camp_123",
        optimization_goal: "LINK_CLICKS",
        billing_event: "IMPRESSIONS",
        targeting: { geo_locations: { countries: ["US"] } },
        pacing_type: "no_pacing",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.pacing_type).toBe('["no_pacing"]');
    });
  });

  describe("createAdCreative", () => {
    it("should include object_story_spec by default", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "creative_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.createAdCreative("act_123", {
        name: "Standard Creative",
        object_story_spec: {
          page_id: "123456",
          link_data: { link: "https://example.com" },
        },
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.name).toBe("Standard Creative");
      expect(body.object_story_spec).toEqual({
        page_id: "123456",
        link_data: { link: "https://example.com" },
      });
    });

    it("should pass optional creative fields through to API", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "creative_456" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.createAdCreative("act_123", {
        name: "Dynamic Creative",
        asset_feed_spec: {
          bodies: [{ text: "Variant A" }],
          images: [{ hash: "abc123" }],
        },
        url_tags: "utm_source=facebook&utm_campaign=test",
        instagram_actor_id: "17840000000000000",
        degrees_of_freedom_spec: { creative_features_spec: {} },
        applink_treatment: "web_only",
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.name).toBe("Dynamic Creative");
      expect(body.object_story_spec).toBeUndefined();
      expect(body.asset_feed_spec).toEqual({
        bodies: [{ text: "Variant A" }],
        images: [{ hash: "abc123" }],
      });
      expect(body.url_tags).toBe("utm_source=facebook&utm_campaign=test");
      expect(body.instagram_actor_id).toBe("17840000000000000");
      expect(body.degrees_of_freedom_spec).toEqual({
        creative_features_spec: {},
      });
      expect(body.applink_treatment).toBe("web_only");
    });
  });

  describe("updateAdSet", () => {
    it("should pass promoted_object when provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { success: true } }),
      );

      const samplePromotedObject = {
        pixel_id: "pixel_456",
        custom_event_type: "PURCHASE",
      };
      const client = new MetaClient({ accessToken: "token" });
      await client.updateAdSet("adset_123", {
        promoted_object: samplePromotedObject,
      });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.promoted_object).toBe(JSON.stringify(samplePromotedObject));
    });

    it("should not include promoted_object when not provided", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { success: true } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.updateAdSet("adset_123", { name: "Updated Name" });

      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.promoted_object).toBeUndefined();
    });
  });

  describe("uploadAdImage", () => {
    it("should upload from URL and return image hash", async () => {
      const imageBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      mockFetch
        .mockResolvedValueOnce(
          new Response(imageBuffer, {
            headers: { "Content-Type": "image/png" },
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            body: {
              images: {
                "image.png": {
                  hash: "abc123hash",
                  url: "https://cdn.example.com/abc123",
                },
              },
            },
          }),
        );

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.uploadAdImage("act_123", {
        url: "https://example.com/image.png",
      });

      expect(result).toEqual({
        image_hash: "abc123hash",
        filename: "image.png",
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should upload from file path and return image hash", async () => {
      vi.mocked(readFile).mockResolvedValue(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
      mockFetch.mockResolvedValue(
        createMockResponse({
          body: {
            images: {
              "banner.png": { hash: "def456hash" },
            },
          },
        }),
      );

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.uploadAdImage("act_123", {
        filePath: "/tmp/banner.png",
      });

      expect(result).toEqual({
        image_hash: "def456hash",
        filename: "banner.png",
      });
      expect(readFile).toHaveBeenCalledWith("/tmp/banner.png");
    });

    it("should throw when neither filePath nor url provided", async () => {
      const client = new MetaClient({ accessToken: "token" });
      await expect(client.uploadAdImage("act_123", {})).rejects.toThrow(
        "Either filePath or url is required",
      );
    });

    it("should throw when both filePath and url provided", async () => {
      const client = new MetaClient({ accessToken: "token" });
      await expect(
        client.uploadAdImage("act_123", {
          filePath: "/tmp/x.png",
          url: "https://example.com/x.png",
        }),
      ).rejects.toThrow("Provide filePath or url, not both");
    });
  });

  describe("getAdImageUrlByHash", () => {
    it("should return url for matching hash", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          body: {
            data: [{ hash: "h1", url: "https://fbcdn/u1.jpg" }],
          },
        }),
      );

      const client = new MetaClient({ accessToken: "token" });
      const url = await client.getAdImageUrlByHash("act_123", "h1");
      expect(url).toBe("https://fbcdn/u1.jpg");
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/adimages");
      expect(calledUrl).toContain("hashes");
    });

    it("should return null when no rows", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));
      const client = new MetaClient({ accessToken: "token" });
      const url = await client.getAdImageUrlByHash("act_123", "missing");
      expect(url).toBeNull();
    });
  });

  describe("getAdSetDetails", () => {
    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "adset_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdSetDetails("adset_123", ["id", "name", "status"]);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/adset_123");
      expect(calledUrl).toContain("fields=id%2Cname%2Cstatus");
    });
  });

  describe("getAds", () => {
    it("should fetch ads for account", async () => {
      const mockData = { data: [{ id: "ad_1" }] };
      mockFetch.mockResolvedValue(createMockResponse({ body: mockData }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.getAds("act_123");

      expect(result).toEqual(mockData);
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/ads");
    });

    it("should filter by campaign_id", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAds("act_123", { campaign_id: "camp_789" });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("filtering=");
      expect(calledUrl).toContain("campaign.id");
      expect(calledUrl).toContain("camp_789");
    });

    it("should include both adset_id and campaign_id filters when provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAds("act_123", {
        adset_id: "adset_123",
        campaign_id: "camp_456",
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("adset.id");
      expect(calledUrl).toContain("campaign.id");
      expect(calledUrl).toContain("adset_123");
      expect(calledUrl).toContain("camp_456");
    });

    it("should pass cursor pagination params", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAds("act_123", {
        after: "after_cursor",
        before: "before_cursor",
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("after=after_cursor");
      expect(calledUrl).toContain("before=before_cursor");
    });

    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAds("act_123", { fields: ["id", "name", "creative"] });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("fields=id%2Cname%2Ccreative");
    });
  });

  describe("getAdDetails", () => {
    it("should request expanded creative fields by default", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "ad_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdDetails("ad_123");

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/ad_123");
      expect(calledUrl).toContain("creative%7Bid%2Cname%2Cbody%2Ctitle");
      expect(calledUrl).toContain("asset_feed_spec");
    });

    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "ad_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdDetails("ad_123", ["id", "name", "creative{id,body}"]);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("fields=id%2Cname%2Ccreative%7Bid%2Cbody%7D");
    });

    it("should fall back to default fields when fields is empty", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({ body: { id: "ad_123" } }),
      );

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdDetails("ad_123", []);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("creative%7Bid%2Cname%2Cbody%2Ctitle");
      expect(calledUrl).not.toContain("fields=&");
    });
  });

  describe("getCampaignAds", () => {
    it("should fetch ads from campaign endpoint with summary metadata", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getCampaignAds("camp_123");

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/camp_123/ads");
      expect(calledUrl).toContain("summary=true");
      expect(calledUrl).toContain(
        "fields=id%2Cname%2Ccreative%7Bid%2Cbody%2Ctitle%7D",
      );
      expect(calledUrl).toContain("limit=100");
    });
  });

  describe("getAdCreatives", () => {
    it("should fetch ad creatives with slim default fields", async () => {
      const mockData = { data: [{ id: "creative_1" }] };
      mockFetch.mockResolvedValue(createMockResponse({ body: mockData }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.getAdCreatives("act_123");

      expect(result).toEqual(mockData);
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/adcreatives");
      expect(calledUrl).toContain("limit=25");
      expect(calledUrl).toContain("summary=true");
      expect(calledUrl).toContain("fields=id%2Cname%2Cbody%2Cthumbnail_url");
      expect(calledUrl).not.toContain("asset_feed_spec");
    });

    it("should pass cursor pagination params", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdCreatives("act_123", {
        limit: 100,
        after: "after_cursor",
        before: "before_cursor",
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("limit=100");
      expect(calledUrl).toContain("after=after_cursor");
      expect(calledUrl).toContain("before=before_cursor");
    });

    it("should allow overriding returned fields", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getAdCreatives("act_123", {
        fields: ["id", "name", "body"],
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("fields=id%2Cname%2Cbody");
    });

    it("should filter creatives by campaign_id via ads and deduplicate by creative id", async () => {
      const mockData = {
        data: [
          {
            id: "ad_1",
            creative: { id: "creative_1", name: "Creative A", body: "Copy A" },
          },
          {
            id: "ad_2",
            creative: { id: "creative_1", name: "Creative A", body: "Copy A" },
          },
          { id: "ad_3" },
        ],
        paging: { cursors: { after: "after_1" } },
      };
      mockFetch.mockResolvedValue(createMockResponse({ body: mockData }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.getAdCreatives("act_123", {
        campaign_id: "camp_123",
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/ads");
      expect(calledUrl).toContain("filtering=");
      expect(calledUrl).toContain("campaign.id");
      expect(calledUrl).toContain("camp_123");
      expect(calledUrl).toContain("summary=true");
      expect(calledUrl).toContain(
        "fields=creative%7Bid%2Cname%2Cbody%2Cthumbnail_url%7D",
      );
      expect(result.data).toEqual([
        { id: "creative_1", name: "Creative A", body: "Copy A" },
      ]);
      expect(result.paging).toEqual(mockData.paging);
    });
  });

  describe("searchTargeting", () => {
    it("should search targeting options", async () => {
      const mockData = {
        data: [{ id: "interest_1", name: "Coffee", type: "interests" }],
      };
      mockFetch.mockResolvedValue(createMockResponse({ body: mockData }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.searchTargeting("adinterest", "coffee");

      expect(result).toEqual(mockData);
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/search");
      expect(calledUrl).toContain("type=adinterest");
      expect(calledUrl).toContain("q=coffee");
    });
  });

  describe("getInsights", () => {
    it("should fetch insights with default preset", async () => {
      const mockData = { data: [{ impressions: 1000 }] };
      mockFetch.mockResolvedValue(createMockResponse({ body: mockData }));

      const client = new MetaClient({ accessToken: "token" });
      const result = await client.getInsights("act_123");

      expect(result).toEqual(mockData);
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("/act_123/insights");
      expect(calledUrl).toContain("date_preset=maximum");
    });

    it("should use custom time_range when provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getInsights("act_123", {
        time_range: { since: "2024-01-01", until: "2024-01-31" },
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("time_range=");
      expect(calledUrl).toContain("2024-01-01");
      expect(calledUrl).toContain("2024-01-31");
    });

    it("should use date_preset when provided", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getInsights("act_123", { date_preset: "last_30d" });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("date_preset=last_30d");
    });
  });

  describe("request pacing", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should pace consecutive requests by minRequestIntervalMs", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));
      const client = new MetaClient({
        accessToken: "token",
        minRequestIntervalMs: 1000,
      });

      const first = client.getAdAccounts();
      await vi.advanceTimersByTimeAsync(0);
      await first;
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const second = client.getAdAccounts();
      await vi.advanceTimersByTimeAsync(900);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      await second;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should apply cooldown before retrying a rate-limited request", async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            status: 429,
            body: createMetaErrorBody(
              17,
              "There have been too many calls from this ad-account. Please wait a bit and try again.",
            ),
          }),
        )
        .mockResolvedValueOnce(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({
        accessToken: "token",
        maxRetries: 1,
        minRequestIntervalMs: 0,
        rateLimitCooldownMs: 5000,
      });

      const pending = client.getAdAccounts();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Base retry backoff (1s) fires first, but cooldown should still block.
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(4001);
      await pending;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should not serialize different ad-account queues", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));
      const client = new MetaClient({
        accessToken: "token",
        minRequestIntervalMs: 1000,
      });

      const first = client.getCampaigns("act_111");
      await vi.advanceTimersByTimeAsync(0);
      await first;
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const second = client.getCampaigns("act_222");
      await vi.advanceTimersByTimeAsync(0);
      await second;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should apply cooldown for RateLimitError even when code is unmapped", async () => {
      const unmappedRateLimitError = new RateLimitError(
        createMetaErrorBody(999, "Unmapped rate limit"),
        1,
      );
      mockFetch
        .mockRejectedValueOnce(unmappedRateLimitError)
        .mockResolvedValueOnce(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({
        accessToken: "token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
        rateLimitCooldownMs: 2000,
      });

      await expect(client.getAdAccounts()).rejects.toThrow(
        unmappedRateLimitError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const second = client.getAdAccounts();
      await vi.advanceTimersByTimeAsync(1900);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      await second;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should isolate cooldowns to the affected ad account", async () => {
      mockFetch
        .mockRejectedValueOnce(
          new RateLimitError(createMetaErrorBody(17, "Rate limit"), 2),
        )
        .mockResolvedValueOnce(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({
        accessToken: "token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
        rateLimitCooldownMs: 5000,
      });

      await expect(client.getCampaigns("act_111")).rejects.toThrow(
        RateLimitError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const unaffected = client.getCampaigns("act_222");
      await vi.advanceTimersByTimeAsync(0);
      await unaffected;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("createMetaClient", () => {
    it("should create MetaClient instance", () => {
      const client = createMetaClient({ accessToken: "token" });
      expect(client).toBeInstanceOf(MetaClient);
    });
  });
});
