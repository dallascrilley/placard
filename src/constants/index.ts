/**
 * Centralized constants for Meta Ads MCP tools.
 *
 * All enum-like constants used across tool files are consolidated here
 * to ensure consistency and eliminate duplication.
 */

// Re-export tool annotations
export {
  READ_ONLY_ANNOTATIONS,
  CREATE_ANNOTATIONS,
  UPDATE_ANNOTATIONS,
  LOGOUT_ANNOTATIONS,
  HEALTH_CHECK_ANNOTATIONS,
} from "./annotations.js";

// =============================================================================
// Insights Constants
// =============================================================================

/**
 * Valid date presets for insights queries.
 */
export const DATE_PRESETS = [
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

/**
 * Valid breakdown dimensions for insights data.
 */
export const BREAKDOWNS = [
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

/**
 * Valid insight aggregation levels.
 */
export const INSIGHT_LEVELS = ["account", "campaign", "adset", "ad"] as const;

/**
 * Default fields returned in insights queries.
 */
export const DEFAULT_INSIGHT_FIELDS = [
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

// =============================================================================
// Campaign Constants
// =============================================================================

/**
 * Valid campaign objectives for Meta API v22.0+.
 */
export const CAMPAIGN_OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_TRAFFIC",
  "OUTCOME_APP_PROMOTION",
] as const;

/**
 * Valid campaign statuses.
 */
export const CAMPAIGN_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "DELETED",
  "ARCHIVED",
] as const;

/**
 * Special ad categories for regulated content.
 */
export const SPECIAL_AD_CATEGORIES = [
  "NONE",
  "EMPLOYMENT",
  "HOUSING",
  "CREDIT",
  "ISSUES_ELECTIONS_POLITICS",
] as const;

// =============================================================================
// Ad Set Constants
// =============================================================================

/**
 * Valid optimization goals for ad sets.
 */
export const OPTIMIZATION_GOALS = [
  "NONE",
  "APP_INSTALLS",
  "AD_RECALL_LIFT",
  "ENGAGED_USERS",
  "EVENT_RESPONSES",
  "IMPRESSIONS",
  "LEAD_GENERATION",
  "QUALITY_LEAD",
  "LINK_CLICKS",
  "OFFSITE_CONVERSIONS",
  "PAGE_LIKES",
  "POST_ENGAGEMENT",
  "QUALITY_CALL",
  "REACH",
  "LANDING_PAGE_VIEWS",
  "VISIT_INSTAGRAM_PROFILE",
  "VALUE",
  "THRUPLAY",
  "DERIVED_EVENTS",
  "APP_INSTALLS_AND_OFFSITE_CONVERSIONS",
  "CONVERSATIONS",
  "IN_APP_VALUE",
  "MESSAGING_PURCHASE_CONVERSION",
  "SUBSCRIBERS",
  "REMINDERS_SET",
  "MEANINGFUL_CALL_ATTEMPT",
  "PROFILE_VISIT",
] as const;

/**
 * Valid billing events for ad sets.
 */
export const BILLING_EVENTS = [
  "APP_INSTALLS",
  "CLICKS",
  "IMPRESSIONS",
  "LINK_CLICKS",
  "NONE",
  "OFFER_CLAIMS",
  "PAGE_LIKES",
  "POST_ENGAGEMENT",
  "THRUPLAY",
  "PURCHASE",
  "LISTING_INTERACTION",
] as const;

/**
 * Valid bid strategies for ad sets.
 */
export const BID_STRATEGIES = [
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
] as const;

export const CUSTOM_EVENT_TYPES = [
  "PURCHASE",
  "LEAD",
  "COMPLETE_REGISTRATION",
  "ADD_TO_CART",
  "INITIATE_CHECKOUT",
  "SEARCH",
  "ADD_PAYMENT_INFO",
  "ADD_TO_WISHLIST",
  "CONTENT_VIEW",
  "OTHER",
] as const;

export const DESTINATION_TYPES = [
  "UNDEFINED",
  "WEBSITE",
  "APP",
  "MESSENGER",
  "WHATSAPP",
  "PHONE_CALL",
  "FACEBOOK",
  "INSTAGRAM_PROFILE",
  "INSTAGRAM_DIRECT",
  "MESSAGING_MESSENGER_WHATSAPP",
  "MESSAGING_INSTAGRAM_DIRECT_MESSENGER",
  "MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP",
  "MESSAGING_INSTAGRAM_DIRECT_WHATSAPP",
  "ON_AD",
  "ON_POST",
  "ON_VIDEO",
  "ON_PAGE",
  "ON_EVENT",
  "SHOP_AUTOMATIC",
  "APPLINKS_AUTOMATIC",
] as const;

export const PACING_TYPES = ["standard", "no_pacing", "day_parting"] as const;

/**
 * Valid ad set statuses.
 */
export const ADSET_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "DELETED",
  "ARCHIVED",
] as const;

// =============================================================================
// Ad Constants
// =============================================================================

/**
 * Valid ad statuses.
 */
export const AD_STATUSES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"] as const;

// =============================================================================
// Targeting Constants
// =============================================================================

/**
 * Valid targeting search types.
 */
export const TARGETING_TYPES = [
  "adinterest",
  "adinterestsuggestion",
  "adinterestvalid",
  "adlocale",
  "adTargetingCategory",
  "adgeolocation",
  "adgeolocationmeta",
  "adradiussuggestion",
  "adworkemployer",
  "adworkposition",
  "adeducationschool",
  "adeducationmajor",
  "adrelationshipstatus",
  "adindustry",
] as const;
