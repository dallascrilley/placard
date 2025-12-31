/**
 * Insights Tools
 *
 * MCP tools for Meta ad performance insights and reporting.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMetaClient } from "../api/meta-client.js";

// Valid date presets for insights
const DATE_PRESETS = [
  "today",
  "yesterday",
  "this_month",
  "last_month",
  "this_quarter",
  "maximum",
  "data_maximum",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d",
  "last_week_mon_sun",
  "last_week_sun_sat",
  "last_quarter",
  "last_year",
  "this_week_mon_today",
  "this_week_sun_today",
  "this_year",
] as const;

// Valid breakdown dimensions
const BREAKDOWNS = [
  "age",
  "gender",
  "country",
  "dma",
  "region",
  "impression_device",
  "platform_position",
  "publisher_platform",
  "device_platform",
  "product_id",
  "frequency_value",
  "hourly_stats_aggregated_by_advertiser_time_zone",
  "hourly_stats_aggregated_by_audience_time_zone",
] as const;

// Valid insight levels
const INSIGHT_LEVELS = ["account", "campaign", "adset", "ad"] as const;

// Common insight fields
const DEFAULT_FIELDS = [
  "impressions",
  "clicks",
  "spend",
  "reach",
  "frequency",
  "cpm",
  "cpp",
  "ctr",
  "cpc",
  "actions",
  "conversions",
  "cost_per_action_type",
];

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
        const normalizedId = account_id.startsWith("act_")
          ? account_id
          : `act_${account_id}`;

        const client = createMetaClient({ userId: user_id ?? "default" });
        const response = await client.getInsights(normalizedId, {
          date_preset,
          time_range,
          breakdown,
          fields: fields ?? DEFAULT_FIELDS,
          level: "account",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  insights: response.data,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
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
          fields: fields ?? DEFAULT_FIELDS,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  insights: response.data,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
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
          fields: fields ?? DEFAULT_FIELDS,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  insights: response.data,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
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
          fields: fields ?? DEFAULT_FIELDS,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  insights: response.data,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
