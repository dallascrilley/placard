/**
 * Insights Tools
 *
 * MCP tools for Meta ad performance insights and reporting.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DEFAULT_INSIGHT_FIELDS,
  INSIGHT_LEVELS,
  READ_ONLY_ANNOTATIONS,
} from "../constants/index.js";
import {
  accountIdSchema,
  breakdownSchema,
  datePresetSchema,
  fieldsSchema,
  responseFormatSchema,
  timeRangeSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import { createSuccessResponse } from "../utils/tool-responses.js";

export function registerInsightsTools(server: McpServer): void {
  /**
   * Get insights for an ad account
   */
  server.tool(
    "meta_get_account_insights",
    `Get performance insights for an entire ad account.

Retrieves aggregated performance metrics for all campaigns, ad sets, and ads within an ad account. Supports date presets (today, yesterday, last_7d, etc.) or custom date ranges. Can include breakdowns by age, gender, country, device, and more.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - date_preset (string, optional): Predefined date range. Options: today, yesterday, this_month, last_month, this_quarter, maximum, data_maximum, last_3d, last_7d, last_14d, last_28d, last_30d, last_90d, last_week_mon_sun, last_week_sun_sat, last_quarter, last_year, this_week_mon_today, this_week_sun_today, this_year (default: 'maximum')
  - time_range (object, optional): Custom date range object with since (YYYY-MM-DD) and until (YYYY-MM-DD). Overrides date_preset when provided.
  - breakdown (string, optional): Breakdown dimension. Options: age, gender, country, dma, region, impression_device, platform_position, publisher_platform, device_platform, product_id, frequency_value, hourly_stats_aggregated_by_advertiser_time_zone, hourly_stats_aggregated_by_audience_time_zone
  - fields (array, optional): Specific fields to return. Default: standard metrics (impressions, clicks, spend, reach, frequency, cpm, cpp, ctr, cpc, actions, conversions, cost_per_action_type)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "insights": [
      {
        "date_start": "2025-01-01",
        "date_stop": "2025-01-31",
        "impressions": "1000000",
        "clicks": "50000",
        "spend": "5000.00",
        "reach": "800000",
        "frequency": "1.25",
        "cpm": "5.00",
        "ctr": "5.00",
        "cpc": "0.10"
      }
    ]
  }

Examples:
  - Last 7 days: { "account_id": "act_123", "date_preset": "last_7d" }
  - Custom range: { "account_id": "act_123", "time_range": { "since": "2025-01-01", "until": "2025-01-31" } }
  - With breakdown: { "account_id": "act_123", "date_preset": "last_30d", "breakdown": "age" }
  - Custom fields: { "account_id": "act_123", "date_preset": "last_7d", "fields": ["impressions", "clicks", "spend"] }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to account
  - 100: Invalid account ID or date range format
  - 1487654: Invalid breakdown or field specification`,
    {
      account_id: accountIdSchema,
      date_preset: datePresetSchema,
      time_range: timeRangeSchema,
      breakdown: breakdownSchema,
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, date_preset, time_range, breakdown, fields },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const response = await client.getInsights(normalizedId, {
          date_preset,
          time_range,
          breakdown,
          fields: fields ?? DEFAULT_INSIGHT_FIELDS,
          level: "account",
        });

        return createSuccessResponse({ insights: response.data }, format);
      },
    ),
  );

  /**
   * Get insights for a campaign
   */
  server.tool(
    "meta_get_campaign_insights",
    `Get performance insights for a specific campaign.

Retrieves performance metrics for a single campaign, including aggregated data across all ad sets and ads within the campaign. Supports date presets or custom date ranges, breakdowns, and custom field selection. Can aggregate at campaign level or drill down to adset/ad level.

Args:
  - campaign_id (string, required): Campaign ID
  - date_preset (string, optional): Predefined date range. Options: today, yesterday, this_month, last_month, this_quarter, maximum, data_maximum, last_3d, last_7d, last_14d, last_28d, last_30d, last_90d, last_week_mon_sun, last_week_sun_sat, last_quarter, last_year, this_week_mon_today, this_week_sun_today, this_year (default: 'maximum')
  - time_range (object, optional): Custom date range object with since (YYYY-MM-DD) and until (YYYY-MM-DD). Overrides date_preset when provided.
  - level (string, optional): Level of aggregation. Options: account, campaign, adset, ad (default: 'campaign')
  - breakdown (string, optional): Breakdown dimension. Options: age, gender, country, dma, region, impression_device, platform_position, publisher_platform, device_platform, product_id, frequency_value, hourly_stats_aggregated_by_advertiser_time_zone, hourly_stats_aggregated_by_audience_time_zone
  - fields (array, optional): Specific fields to return. Default: standard metrics (impressions, clicks, spend, reach, frequency, cpm, cpp, ctr, cpc, actions, conversions, cost_per_action_type)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "insights": [
      {
        "campaign_id": "123456789",
        "campaign_name": "Summer Sale",
        "date_start": "2025-01-01",
        "date_stop": "2025-01-31",
        "impressions": "500000",
        "clicks": "25000",
        "spend": "2500.00",
        "reach": "400000",
        "frequency": "1.25",
        "cpm": "5.00",
        "ctr": "5.00",
        "cpc": "0.10"
      }
    ]
  }

Examples:
  - Campaign level: { "campaign_id": "123", "date_preset": "last_7d" }
  - Ad set breakdown: { "campaign_id": "123", "date_preset": "last_30d", "level": "adset" }
  - With age breakdown: { "campaign_id": "123", "date_preset": "last_30d", "breakdown": "age" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to campaign
  - 100: Invalid campaign ID or date range format
  - 1487654: Invalid breakdown or field specification`,
    {
      campaign_id: z.string().describe("Campaign ID"),
      date_preset: datePresetSchema,
      time_range: timeRangeSchema,
      level: z
        .enum(INSIGHT_LEVELS)
        .optional()
        .describe("Level of aggregation (default: 'campaign')"),
      breakdown: breakdownSchema,
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { campaign_id, date_preset, time_range, level, breakdown, fields },
        { client, format },
      ) => {
        const response = await client.getInsights(campaign_id, {
          date_preset,
          time_range,
          level: level ?? "campaign",
          breakdown,
          fields: fields ?? DEFAULT_INSIGHT_FIELDS,
        });

        return createSuccessResponse({ insights: response.data }, format);
      },
    ),
  );

  /**
   * Get insights for an ad set
   */
  server.tool(
    "meta_get_adset_insights",
    `Get performance insights for a specific ad set.

Retrieves performance metrics for a single ad set, including aggregated data across all ads within the ad set. Supports date presets or custom date ranges, breakdowns by demographics or device, and custom field selection. Useful for analyzing ad set performance and optimization opportunities.

Args:
  - adset_id (string, required): Ad set ID
  - date_preset (string, optional): Predefined date range. Options: today, yesterday, this_month, last_month, this_quarter, maximum, data_maximum, last_3d, last_7d, last_14d, last_28d, last_30d, last_90d, last_week_mon_sun, last_week_sun_sat, last_quarter, last_year, this_week_mon_today, this_week_sun_today, this_year (default: 'maximum')
  - time_range (object, optional): Custom date range object with since (YYYY-MM-DD) and until (YYYY-MM-DD). Overrides date_preset when provided.
  - breakdown (string, optional): Breakdown dimension. Options: age, gender, country, dma, region, impression_device, platform_position, publisher_platform, device_platform, product_id, frequency_value, hourly_stats_aggregated_by_advertiser_time_zone, hourly_stats_aggregated_by_audience_time_zone
  - fields (array, optional): Specific fields to return. Default: standard metrics (impressions, clicks, spend, reach, frequency, cpm, cpp, ctr, cpc, actions, conversions, cost_per_action_type)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "insights": [
      {
        "adset_id": "123456789",
        "adset_name": "US Adults 25-45",
        "date_start": "2025-01-01",
        "date_stop": "2025-01-31",
        "impressions": "250000",
        "clicks": "12500",
        "spend": "1250.00",
        "reach": "200000",
        "frequency": "1.25",
        "cpm": "5.00",
        "ctr": "5.00",
        "cpc": "0.10"
      }
    ]
  }

Examples:
  - Last 7 days: { "adset_id": "123", "date_preset": "last_7d" }
  - Custom range: { "adset_id": "123", "time_range": { "since": "2025-01-01", "until": "2025-01-31" } }
  - With device breakdown: { "adset_id": "123", "date_preset": "last_30d", "breakdown": "impression_device" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to ad set
  - 100: Invalid ad set ID or date range format
  - 1487654: Invalid breakdown or field specification`,
    {
      adset_id: z.string().describe("Ad set ID"),
      date_preset: datePresetSchema,
      time_range: timeRangeSchema,
      breakdown: breakdownSchema,
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { adset_id, date_preset, time_range, breakdown, fields },
        { client, format },
      ) => {
        const response = await client.getInsights(adset_id, {
          date_preset,
          time_range,
          level: "adset",
          breakdown,
          fields: fields ?? DEFAULT_INSIGHT_FIELDS,
        });

        return createSuccessResponse({ insights: response.data }, format);
      },
    ),
  );

  /**
   * Get insights for an ad
   */
  server.tool(
    "meta_get_ad_insights",
    `Get performance insights for a specific ad.

Retrieves performance metrics for a single ad including impressions, clicks, spend, engagement, and conversion data. Supports date presets or custom date ranges, breakdowns by demographics or device, and custom field selection. Useful for analyzing individual ad performance and creative effectiveness.

Args:
  - ad_id (string, required): Ad ID
  - date_preset (string, optional): Predefined date range. Options: today, yesterday, this_month, last_month, this_quarter, maximum, data_maximum, last_3d, last_7d, last_14d, last_28d, last_30d, last_90d, last_week_mon_sun, last_week_sun_sat, last_quarter, last_year, this_week_mon_today, this_week_sun_today, this_year (default: 'maximum')
  - time_range (object, optional): Custom date range object with since (YYYY-MM-DD) and until (YYYY-MM-DD). Overrides date_preset when provided.
  - breakdown (string, optional): Breakdown dimension. Options: age, gender, country, dma, region, impression_device, platform_position, publisher_platform, device_platform, product_id, frequency_value, hourly_stats_aggregated_by_advertiser_time_zone, hourly_stats_aggregated_by_audience_time_zone
  - fields (array, optional): Specific fields to return. Default: standard metrics (impressions, clicks, spend, reach, frequency, cpm, cpp, ctr, cpc, actions, conversions, cost_per_action_type)
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "insights": [
      {
        "ad_id": "123456789",
        "ad_name": "Summer Sale Ad",
        "date_start": "2025-01-01",
        "date_stop": "2025-01-31",
        "impressions": "100000",
        "clicks": "5000",
        "spend": "500.00",
        "reach": "80000",
        "frequency": "1.25",
        "cpm": "5.00",
        "ctr": "5.00",
        "cpc": "0.10",
        "actions": [
          { "action_type": "link_click", "value": "5000" }
        ]
      }
    ]
  }

Examples:
  - Last 7 days: { "ad_id": "123", "date_preset": "last_7d" }
  - Custom range: { "ad_id": "123", "time_range": { "since": "2025-01-01", "until": "2025-01-31" } }
  - With gender breakdown: { "ad_id": "123", "date_preset": "last_30d", "breakdown": "gender" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to ad
  - 100: Invalid ad ID or date range format
  - 1487654: Invalid breakdown or field specification`,
    {
      ad_id: z.string().describe("Ad ID"),
      date_preset: datePresetSchema,
      time_range: timeRangeSchema,
      breakdown: breakdownSchema,
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { ad_id, date_preset, time_range, breakdown, fields },
        { client, format },
      ) => {
        const response = await client.getInsights(ad_id, {
          date_preset,
          time_range,
          level: "ad",
          breakdown,
          fields: fields ?? DEFAULT_INSIGHT_FIELDS,
        });

        return createSuccessResponse({ insights: response.data }, format);
      },
    ),
  );
}
