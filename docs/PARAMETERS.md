# Parameter Reference

This document provides detailed information about key parameters across Meta Ads MCP tools.

## Campaign Parameters

### `objective`
Required when creating campaigns. Defines the campaign's marketing objective.

Common values:
- `OUTCOME_SALES` - Drive conversions/purchases
- `OUTCOME_ENGAGEMENT` - Drive engagement (likes, shares, event responses)
- `OUTCOME_TRAFFIC` - Drive website traffic
- `OUTCOME_AWARENESS` - Build brand awareness
- `OUTCOME_LEADS` - Generate leads
- `OUTCOME_APP_PROMOTION` - Promote app installs

### `special_ad_categories`
Array of special ad category classifications. Required for regulated ad types.

Values:
- `HOUSING` - Real estate, rentals, housing services
- `EMPLOYMENT` - Job ads, recruiting
- `CREDIT` - Financial services, loans, credit cards
- `ISSUES_ELECTIONS_POLITICS` - Political ads, advocacy

**Important**: When using any of these categories, you **must** also provide `special_ad_category_country`.

### `special_ad_category_country`
**New in recent update**

Array of ISO 2-letter country codes (e.g., `['US']`, `['US', 'CA']`).

**Required when**: `special_ad_categories` includes `HOUSING`, `EMPLOYMENT`, `CREDIT`, or `ISSUES_ELECTIONS_POLITICS`.

Example:
```json
{
  "special_ad_categories": ["HOUSING"],
  "special_ad_category_country": ["US"]
}
```

### `spend_cap`
**New in recent update**

Hard cap on total campaign spend in cents.

- Type: Integer
- Unit: Cents (e.g., `50000` = $500)
- Different from `lifetime_budget` - this is an absolute maximum
- Optional parameter

Example:
```json
{
  "daily_budget": 1000,
  "spend_cap": 50000
}
```
This creates a campaign with $10/day budget but will never spend more than $500 total.

### `promoted_object`
**New in recent update (campaigns)**

Object containing promoted object details for event/app campaigns.

Common fields:
- `pixel_id` - Meta Pixel ID
- `custom_event_type` - Event type (PURCHASE, LEAD, COMPLETE_REGISTRATION, etc.)
- `event_id` - Facebook event ID
- `application_id` - App ID for app promotion
- `page_id` - Facebook Page ID

**Constraint**: When using `EVENT_RESPONSES` optimization goal, do **not** include `event_id` in promoted_object. Event linking should be in the ad creative URL.

## Ad Set Parameters

### `destination_type`
**New in recent update**

Specifies where users are directed after clicking the ad.

Values:
- `WEBSITE` - Direct to website
- `MESSENGER` - Open Messenger conversation
- `WHATSAPP` - Open WhatsApp conversation
- `PHONE_CALL` - Initiate phone call
- `FACEBOOK` - Navigate within Facebook
- `INSTAGRAM_PROFILE` - Go to Instagram profile
- `INSTAGRAM_DIRECT` - Open Instagram Direct message
- `APP` - Deep link to app
- `MESSAGING_MESSENGER_WHATSAPP` - Choice between Messenger/WhatsApp

**Important**: Must be compatible with campaign objective and optimization goal.

Example:
```json
{
  "objective": "OUTCOME_ENGAGEMENT",
  "optimization_goal": "EVENT_RESPONSES",
  "destination_type": "MESSENGER"
}
```

### `is_dynamic_creative`
**New in recent update**

Enable Advantage+ dynamic creative (formerly Dynamic Creative).

- Type: Boolean
- Default: `false`
- **Can only be set at creation** - cannot be changed later
- When enabled, Meta automatically tests combinations of creative assets

Example:
```json
{
  "is_dynamic_creative": true
}
```

### `pacing_type`
**New in recent update**

Controls ad delivery speed.

Values:
- `standard` (default) - Even delivery throughout the day
- `no_pacing` - Accelerated delivery (spend budget as quickly as possible)
- `day_parting` - Scheduled delivery (requires `adset_schedule` and `lifetime_budget`)

Example:
```json
{
  "pacing_type": "standard"
}
```

For scheduled delivery:
```json
{
  "pacing_type": "day_parting",
  "lifetime_budget": 10000,
  "adset_schedule": [...schedule specification...]
}
```

### `targeting`

Targeting specification object. Complex nested structure.

#### Key Fields

**Geographic targeting**:
```json
{
  "geo_locations": {
    "countries": ["US"],
    "cities": [
      {
        "key": "2418779",
        "radius": 25,
        "distance_unit": "mile"
      }
    ],
    "custom_locations": [
      {
        "latitude": 37.7749,
        "longitude": -122.4194,
        "radius": 10,
        "distance_unit": "mile"
      }
    ]
  }
}
```

**Radius Constraints**:
- Cities: 10–50 miles (17–80 km)
- Custom locations: 0.63–50 miles (1–80 km)

**Demographics**:
```json
{
  "age_min": 21,
  "age_max": 65,
  "genders": [1, 2]
}
```

**Advantage+ Audience Constraint**:
- When `targeting_automation.advantage_audience` is `1` (or omitted), `age_max` **must be 65**
- To use `age_max < 65`, explicitly set `targeting_automation.advantage_audience: 0`

**Interests and behaviors**:
```json
{
  "flexible_spec": [
    {
      "interests": [
        {"id": "6003139266461", "name": "Wedding planning"}
      ]
    }
  ]
}
```

### `optimization_goal`

What the ad set optimizes delivery for.

Common values:
- `LINK_CLICKS` - Maximize link clicks
- `LANDING_PAGE_VIEWS` - Maximize landing page views
- `IMPRESSIONS` - Maximize impressions
- `REACH` - Maximize unique reach
- `POST_ENGAGEMENT` - Maximize post engagement
- `EVENT_RESPONSES` - Maximize event responses
- `OFFSITE_CONVERSIONS` - Maximize conversions tracked by pixel
- `THRUPLAY` - Maximize video plays to completion

**Compatibility**: Different objectives support different optimization goals. See compatibility matrix in campaign creation documentation.

### `billing_event`

What you're charged for.

Common values:
- `IMPRESSIONS` - Charge per 1000 impressions (CPM)
- `LINK_CLICKS` - Charge per link click (CPC)
- `THRUPLAY` - Charge per video play
- `POST_ENGAGEMENT` - Charge per engagement

### `promoted_object` (Ad Sets)

Similar to campaign-level `promoted_object`, but applied at ad set level.

**Important constraints**:
- Required for `OFFSITE_CONVERSIONS` optimization goal
- **Do not use `event_id`** with `EVENT_RESPONSES` optimization goal
- For Event Response campaigns, link to the event in the creative URL instead

## Budget Parameters

### Campaign vs Ad Set Budgets

**Campaign-level budget (CBO)**:
- Set `daily_budget` or `lifetime_budget` on campaign
- Ad sets must **not** have budgets
- Meta automatically distributes budget across ad sets

**Ad set-level budget**:
- Campaign has no budget
- Each ad set has its own `daily_budget` or `lifetime_budget`
- Manual control over spend per ad set

### `daily_budget`
Daily spending limit in cents.

Example: `1000` = $10.00 per day

### `lifetime_budget`
Total spending limit for campaign/ad set duration in cents.

Example: `50000` = $500.00 total

**Requirement**: Must specify either `daily_budget` OR `lifetime_budget` (not both).

### `spend_cap`
Absolute maximum spend for a campaign (regardless of budget type).

- Only available at campaign level
- Different from `lifetime_budget`
- Campaign stops when spend_cap is reached

## Validation & Constraints Summary

| Parameter | Constraint | Impact |
|-----------|-----------|---------|
| `age_max` with Advantage+ | Must be 65 | API rejection if < 65 with advantage_audience enabled |
| `geo_locations.cities.radius` | 10–50 mi (17–80 km) | API rejection if outside range |
| `geo_locations.custom_locations.radius` | 0.63–50 mi (1–80 km) | API rejection if outside range |
| `special_ad_category_country` | Required with certain categories | API rejection if missing |
| `promoted_object.event_id` | Not allowed with EVENT_RESPONSES | API rejection |
| Ad set budget with CBO | Must be omitted | API rejection if present |
| `is_dynamic_creative` | Set at creation only | Cannot be changed after creation |

## Examples

### Create Campaign with Special Ad Categories
```json
{
  "account_id": "act_123456789",
  "name": "Housing Campaign",
  "objective": "OUTCOME_LEADS",
  "status": "PAUSED",
  "special_ad_categories": ["HOUSING"],
  "special_ad_category_country": ["US"],
  "daily_budget": 5000,
  "spend_cap": 100000
}
```

### Create Ad Set with Dynamic Creative
```json
{
  "account_id": "act_123456789",
  "name": "Dynamic Ad Set",
  "campaign_id": "123456789",
  "optimization_goal": "LINK_CLICKS",
  "billing_event": "IMPRESSIONS",
  "is_dynamic_creative": true,
  "destination_type": "WEBSITE",
  "pacing_type": "standard",
  "targeting": {
    "geo_locations": {"countries": ["US"]},
    "age_min": 21,
    "age_max": 65,
    "targeting_automation": {"advantage_audience": 1}
  },
  "daily_budget": 1000
}
```

### Create Ad Set with Custom Geographic Targeting
```json
{
  "account_id": "act_123456789",
  "name": "Local Ad Set",
  "campaign_id": "123456789",
  "optimization_goal": "REACH",
  "billing_event": "IMPRESSIONS",
  "targeting": {
    "geo_locations": {
      "custom_locations": [
        {
          "latitude": 40.7128,
          "longitude": -74.0060,
          "radius": 15,
          "distance_unit": "mile",
          "name": "Downtown NYC"
        }
      ]
    },
    "age_min": 25,
    "age_max": 65
  },
  "daily_budget": 2000
}
```
