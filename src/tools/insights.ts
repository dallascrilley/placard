/**
 * Insights Tools
 *
 * MCP tools for Meta ad performance insights and reporting.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";
import {
  BREAKDOWNS,
  DATE_PRESETS,
  DEFAULT_INSIGHT_FIELDS,
  INSIGHT_LEVELS,
} from "../constants/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../utils/tool-responses.js";

export function registerInsightsTools(server: McpServer): void {
  /**
   * Get insights for an ad account
   */
  server.tool(
    "get_account_insights",
    "Get performance insights for an entire ad account",
    {
      account_id: z
        .string()
        .describe("Ad account ID (with or without 'act_' prefix)"),
      date_preset: z
        .enum(DATE_PRESETS)
        .optional()
        .describe("Predefined date range (default: 'maximum')"),
      time_range: z
        .object({
          since: z.string().describe("Start date in YYYY-MM-DD format"),
          until: z.string().describe("End date in YYYY-MM-DD format"),
        })
        .optional()
        .describe("Custom date range (overrides date_preset)"),
      breakdown: z
        .enum(BREAKDOWNS)
        .optional()
        .describe("Breakdown dimension for the data"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Specific fields to return (default: standard metrics)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({
      account_id,
      date_preset,
      time_range,
      breakdown,
      fields,
      user_id,
    }) => {
      try {
        const normalizedId = normalizeAccountId(account_id);
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getInsights(normalizedId, {
          date_preset,
          time_range,
          breakdown,
          fields: fields ?? DEFAULT_INSIGHT_FIELDS,
          level: "account",
        });

        return createSuccessResponse({ insights: response.data });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );

  /**
   * Get insights for a campaign
   */
  server.tool(
    "get_campaign_insights",
    "Get performance insights for a specific campaign",
    {
      campaign_id: z.string().describe("Campaign ID"),
      date_preset: z
        .enum(DATE_PRESETS)
        .optional()
        .describe("Predefined date range (default: 'maximum')"),
      time_range: z
        .object({
          since: z.string().describe("Start date in YYYY-MM-DD format"),
          until: z.string().describe("End date in YYYY-MM-DD format"),
        })
        .optional()
        .describe("Custom date range (overrides date_preset)"),
      level: z
        .enum(INSIGHT_LEVELS)
        .optional()
        .describe("Level of aggregation (default: 'campaign')"),
      breakdown: z
        .enum(BREAKDOWNS)
        .optional()
        .describe("Breakdown dimension for the data"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Specific fields to return (default: standard metrics)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({
      campaign_id,
      date_preset,
      time_range,
      level,
      breakdown,
      fields,
      user_id,
    }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getInsights(campaign_id, {
          date_preset,
          time_range,
          level: level ?? "campaign",
          breakdown,
          fields: fields ?? DEFAULT_INSIGHT_FIELDS,
        });

        return createSuccessResponse({ insights: response.data });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );

  /**
   * Get insights for an ad set
   */
  server.tool(
    "get_adset_insights",
    "Get performance insights for a specific ad set",
    {
      adset_id: z.string().describe("Ad set ID"),
      date_preset: z
        .enum(DATE_PRESETS)
        .optional()
        .describe("Predefined date range (default: 'maximum')"),
      time_range: z
        .object({
          since: z.string().describe("Start date in YYYY-MM-DD format"),
          until: z.string().describe("End date in YYYY-MM-DD format"),
        })
        .optional()
        .describe("Custom date range (overrides date_preset)"),
      breakdown: z
        .enum(BREAKDOWNS)
        .optional()
        .describe("Breakdown dimension for the data"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Specific fields to return (default: standard metrics)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({
      adset_id,
      date_preset,
      time_range,
      breakdown,
      fields,
      user_id,
    }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getInsights(adset_id, {
          date_preset,
          time_range,
          level: "adset",
          breakdown,
          fields: fields ?? DEFAULT_INSIGHT_FIELDS,
        });

        return createSuccessResponse({ insights: response.data });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );

  /**
   * Get insights for an ad
   */
  server.tool(
    "get_ad_insights",
    "Get performance insights for a specific ad",
    {
      ad_id: z.string().describe("Ad ID"),
      date_preset: z
        .enum(DATE_PRESETS)
        .optional()
        .describe("Predefined date range (default: 'maximum')"),
      time_range: z
        .object({
          since: z.string().describe("Start date in YYYY-MM-DD format"),
          until: z.string().describe("End date in YYYY-MM-DD format"),
        })
        .optional()
        .describe("Custom date range (overrides date_preset)"),
      breakdown: z
        .enum(BREAKDOWNS)
        .optional()
        .describe("Breakdown dimension for the data"),
      fields: z
        .array(z.string())
        .optional()
        .describe("Specific fields to return (default: standard metrics)"),
      user_id: z
        .string()
        .optional()
        .describe("User ID for multi-user authentication (default: 'default')"),
    },
    async ({ ad_id, date_preset, time_range, breakdown, fields, user_id }) => {
      try {
        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getInsights(ad_id, {
          date_preset,
          time_range,
          level: "ad",
          breakdown,
          fields: fields ?? DEFAULT_INSIGHT_FIELDS,
        });

        return createSuccessResponse({ insights: response.data });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  );
}
