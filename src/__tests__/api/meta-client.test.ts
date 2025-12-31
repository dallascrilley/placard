import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaAuth } from "../../api/auth.js";
import { AuthenticationError, MetaApiError } from "../../api/error-handling.js";
import { MetaClient, createMetaClient } from "../../api/meta-client.js";
import {
  createMetaErrorBody,
  createMockResponse,
} from "../utils/mock-fetch.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock console.error to avoid test output noise
vi.spyOn(console, "error").mockImplementation(() => {});

describe("MetaClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
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
    });

    it("should apply status filter", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ body: { data: [] } }));

      const client = new MetaClient({ accessToken: "token" });
      await client.getCampaigns("act_123", { status: "ACTIVE" });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("filtering=");
      expect(calledUrl).toContain("ACTIVE");
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

  describe("createMetaClient", () => {
    it("should create MetaClient instance", () => {
      const client = createMetaClient({ accessToken: "token" });
      expect(client).toBeInstanceOf(MetaClient);
    });
  });
});
