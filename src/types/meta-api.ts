/**
 * Meta Marketing API Type Definitions
 * API Version: v22.0
 */

// Campaign objectives (new OUTCOME-based objectives)
export type CampaignObjective =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_APP_PROMOTION";

// Entity status
export type EntityStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

// Optimization goals for ad sets
export type OptimizationGoal =
  | "NONE"
  | "APP_INSTALLS"
  | "AD_RECALL_LIFT"
  | "ENGAGED_USERS"
  | "EVENT_RESPONSES"
  | "IMPRESSIONS"
  | "LEAD_GENERATION"
  | "QUALITY_LEAD"
  | "LINK_CLICKS"
  | "OFFSITE_CONVERSIONS"
  | "PAGE_LIKES"
  | "POST_ENGAGEMENT"
  | "QUALITY_CALL"
  | "REACH"
  | "LANDING_PAGE_VIEWS"
  | "VISIT_INSTAGRAM_PROFILE"
  | "VALUE"
  | "THRUPLAY"
  | "DERIVED_EVENTS"
  | "APP_INSTALLS_AND_OFFSITE_CONVERSIONS"
  | "CONVERSATIONS"
  | "IN_APP_VALUE"
  | "MESSAGING_PURCHASE_CONVERSION"
  | "SUBSCRIBERS"
  | "REMINDERS_SET"
  | "MEANINGFUL_CALL_ATTEMPT"
  | "PROFILE_VISIT"
  | "MESSAGING_APPOINTMENT_CONVERSION";

// Billing events
export type BillingEvent =
  | "APP_INSTALLS"
  | "IMPRESSIONS"
  | "LINK_CLICKS"
  | "NONE"
  | "OFFER_CLAIMS"
  | "PAGE_LIKES"
  | "POST_ENGAGEMENT"
  | "THRUPLAY"
  | "PURCHASE"
  | "LISTING_INTERACTION";

// Bid strategies
export type BidStrategy =
  | "LOWEST_COST_WITHOUT_CAP"
  | "LOWEST_COST_WITH_BID_CAP"
  | "COST_CAP"
  | "LOWEST_COST_WITH_MIN_ROAS";

// Call to action types
export type CallToActionType =
  | "OPEN_LINK"
  | "LIKE_PAGE"
  | "SHOP_NOW"
  | "PLAY_GAME"
  | "INSTALL_APP"
  | "USE_APP"
  | "CALL"
  | "CALL_ME"
  | "INSTALL_MOBILE_APP"
  | "USE_MOBILE_APP"
  | "MOBILE_DOWNLOAD"
  | "BOOK_TRAVEL"
  | "LISTEN_MUSIC"
  | "WATCH_VIDEO"
  | "LEARN_MORE"
  | "SIGN_UP"
  | "DOWNLOAD"
  | "WATCH_MORE"
  | "NO_BUTTON"
  | "VISIT_PAGES_FEED"
  | "APPLY_NOW"
  | "BUY_NOW"
  | "GET_OFFER"
  | "GET_OFFER_VIEW"
  | "BUY_TICKETS"
  | "UPDATE_APP"
  | "GET_DIRECTIONS"
  | "BUY"
  | "MESSAGE_PAGE"
  | "DONATE"
  | "SUBSCRIBE"
  | "SAY_THANKS"
  | "SELL_NOW"
  | "SHARE"
  | "DONATE_NOW"
  | "GET_QUOTE"
  | "CONTACT_US"
  | "ORDER_NOW"
  | "ADD_TO_CART"
  | "VIDEO_ANNOTATION"
  | "MOMENTS"
  | "RECORD_NOW"
  | "GET_SHOWTIMES"
  | "LISTEN_NOW"
  | "WOODHENGE_SUPPORT"
  | "EVENT_RSVP"
  | "WHATSAPP_MESSAGE"
  | "FOLLOW_NEWS_STORYLINE"
  | "SEE_MORE"
  | "FIND_A_GROUP"
  | "FIND_YOUR_GROUPS"
  | "PAY_TO_ACCESS"
  | "PURCHASE_GIFT_CARDS"
  | "FOLLOW_PAGE"
  | "SEND_A_GIFT"
  | "SWIPE_UP_PRODUCT"
  | "SWIPE_UP_SHOP"
  | "PLAY_GAME_ON_FACEBOOK"
  | "VISIT_WORLD"
  | "OPEN_INSTANT_APP"
  | "JOIN_CHANNEL"
  | "VIEW_PRODUCT"
  | "ASK_ABOUT_SERVICES"
  | "BOOK_NOW"
  | "CONTACT"
  | "START_ORDER"
  | "GET_MOBILE_APP"
  | "VIEW_CHANNEL"
  | "AUDIO_CALL"
  | "VIDEO_CALL"
  | "MISSED_CALL"
  | "GET_OFFER_SIGN_UP";

// Ad Account
export interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  amount_spent: string;
  balance: string;
  business?: {
    id: string;
    name: string;
  };
  funding_source_details?: {
    id: string;
    display_string: string;
    type: number;
  };
}

// Campaign
export interface Campaign {
  id: string;
  name: string;
  objective: CampaignObjective;
  status: EntityStatus;
  effective_status: string;
  created_time: string;
  updated_time: string;
  start_time?: string;
  stop_time?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  special_ad_categories: string[];
  special_ad_category?: string;
  special_ad_category_country?: string[];
  promoted_object?: PromotedObject;
}

export interface PromotedObject {
  pixel_id?: string;
  custom_event_type?: string;
  event_id?: string;
  application_id?: string;
  object_store_url?: string;
  offer_id?: string;
  page_id?: string;
}

// Ad Set
export interface AdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: EntityStatus;
  effective_status: string;
  optimization_goal: OptimizationGoal;
  billing_event: BillingEvent;
  bid_strategy?: BidStrategy;
  bid_amount?: number;
  promoted_object?: PromotedObject;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  targeting: Targeting;
  start_time?: string;
  end_time?: string;
  created_time: string;
  updated_time: string;
}

// Targeting specification
export interface Targeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: GeoLocations;
  locales?: number[];
  custom_audiences?: CustomAudience[];
  excluded_custom_audiences?: CustomAudience[];
  flexible_spec?: FlexibleSpec[];
  exclusions?: FlexibleSpec;
  targeting_automation?: {
    advantage_audience?: number;
  };
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  device_platforms?: string[];
}

export interface GeoLocations {
  countries?: string[];
  regions?: Array<{ key: string; name?: string }>;
  cities?: Array<{
    key: string;
    name?: string;
    radius?: number;
    distance_unit?: "mile" | "kilometer";
  }>;
  zips?: Array<{ key: string }>;
  location_types?: string[];
}

export interface CustomAudience {
  id: string;
  name?: string;
}

export interface FlexibleSpec {
  interests?: Array<{ id: string; name?: string }>;
  behaviors?: Array<{ id: string; name?: string }>;
  demographics?: Array<{ id: string; name?: string }>;
  life_events?: Array<{ id: string; name?: string }>;
  industries?: Array<{ id: string; name?: string }>;
  income?: Array<{ id: string; name?: string }>;
  family_statuses?: Array<{ id: string; name?: string }>;
  education_schools?: Array<{ id: string; name?: string }>;
  education_statuses?: number[];
  college_years?: number[];
  relationship_statuses?: number[];
  work_employers?: Array<{ id: string; name?: string }>;
  work_positions?: Array<{ id: string; name?: string }>;
}

// Ad
export interface Ad {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: EntityStatus;
  effective_status: string;
  creative?: AdCreative;
  created_time: string;
  updated_time: string;
  tracking_specs?: object;
  conversion_specs?: object;
}

// Ad Creative
export interface AdCreative {
  id: string;
  name: string;
  title?: string;
  body?: string;
  image_hash?: string;
  image_url?: string;
  video_id?: string;
  object_story_spec?: ObjectStorySpec;
  asset_feed_spec?: Record<string, unknown>;
  call_to_action_type?: CallToActionType;
  link_url?: string;
  thumbnail_url?: string;
}

export interface ObjectStorySpec {
  page_id: string;
  link_data?: LinkData;
  video_data?: VideoData;
  photo_data?: PhotoData;
}

export interface LinkData {
  link: string;
  message?: string;
  name?: string;
  description?: string;
  caption?: string;
  image_hash?: string;
  call_to_action?: {
    type: CallToActionType;
    value?: {
      link?: string;
      link_caption?: string;
    };
  };
}

export interface VideoData {
  video_id: string;
  title?: string;
  message?: string;
  image_hash?: string;
  call_to_action?: {
    type: CallToActionType;
    value?: {
      link?: string;
    };
  };
}

export interface PhotoData {
  image_hash: string;
  caption?: string;
}

// Insights
export interface Insights {
  account_id: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  date_start: string;
  date_stop: string;
  impressions: string;
  clicks?: string;
  spend: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  cpp?: string;
  ctr?: string;
  cpc?: string;
  actions?: Action[];
  conversions?: Action[];
  cost_per_action_type?: CostPerAction[];
  cost_per_conversion?: CostPerAction[];
}

export interface Action {
  action_type: string;
  value: string;
  "1d_click"?: string;
  "1d_view"?: string;
  "7d_click"?: string;
  "7d_view"?: string;
}

export interface CostPerAction {
  action_type: string;
  value: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  data: T[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
    previous?: string;
  };
  summary?: {
    total_count?: number;
  };
}

// Error response
export interface ApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

// Reach estimate response
export interface ReachEstimate {
  users_lower_bound: number;
  users_upper_bound: number;
}

// Targeting search result
export interface TargetingSearchResult {
  id: string;
  name: string;
  type: string;
  path?: string[];
  description?: string;
  audience_size_lower_bound?: number;
  audience_size_upper_bound?: number;
}
