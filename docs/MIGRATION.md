# Migration Guide

## Upgrading to Latest Version

This guide helps you update your code when new features and parameters are added to the Meta Ads MCP server.

### Recent Updates (February 2026)

#### New Delete Tools

Three new convenience tools for soft-deleting resources:

**Before**:
```typescript
// Manual deletion via update
await meta_update_campaign({
  campaign_id: "123456789",
  status: "DELETED"
});
```

**Now**:
```typescript
// Simpler deletion syntax
await meta_delete_campaign({
  campaign_id: "123456789"
});

await meta_delete_adset({
  adset_id: "987654321"
});

await meta_delete_ad({
  ad_id: "456789123"
});
```

**Migration**: No action required. Old approach still works. New tools are optional convenience wrappers.

---

#### Campaign Creation Changes

##### 1. Special Ad Categories Now Require Country Specification

**Breaking Change**: If you're using `HOUSING`, `EMPLOYMENT`, `CREDIT`, or `ISSUES_ELECTIONS_POLITICS`, you must now include `special_ad_category_country`.

**Before**:
```typescript
await meta_create_campaign({
  name: "Housing Campaign",
  objective: "OUTCOME_LEADS",
  special_ad_categories: ["HOUSING"],
  daily_budget: 5000
});
// This will now fail with validation error
```

**Now**:
```typescript
await meta_create_campaign({
  name: "Housing Campaign",
  objective: "OUTCOME_LEADS",
  special_ad_categories: ["HOUSING"],
  special_ad_category_country: ["US"], // Required
  daily_budget: 5000
});
```

**Migration**:
1. Review all campaigns using special ad categories
2. Add `special_ad_category_country` array with appropriate ISO country codes
3. Common values: `['US']`, `['CA']`, `['US', 'CA']`

##### 2. New Optional Campaign Parameters

**`spend_cap`** - Hard cap on total campaign spend:
```typescript
await meta_create_campaign({
  name: "Limited Spend Campaign",
  objective: "OUTCOME_TRAFFIC",
  daily_budget: 1000,
  spend_cap: 50000 // Never spend more than $500 total
});
```

**`promoted_object`** - For event/app campaigns:
```typescript
await meta_create_campaign({
  name: "Event Campaign",
  objective: "OUTCOME_ENGAGEMENT",
  promoted_object: {
    event_id: "123456789",
    page_id: "987654321"
  },
  daily_budget: 2000
});
```

**Migration**: No action required. These are optional parameters.

---

#### Ad Set Creation Changes

##### 1. Enhanced Geo Targeting Validation

**Breaking Change**: Geo radius values are now validated before API submission.

**Constraints**:
- Cities: 10–50 miles (17–80 km)
- Custom locations: 0.63–50 miles (1–80 km)

**Before**:
```typescript
await meta_create_adset({
  targeting: {
    geo_locations: {
      cities: [{
        key: "2418779",
        radius: 5, // Too small - will be rejected
        distance_unit: "mile"
      }]
    }
  }
});
// API error: radius out of range
```

**Now**:
```typescript
await meta_create_adset({
  targeting: {
    geo_locations: {
      cities: [{
        key: "2418779",
        radius: 15, // Valid: 10-50 range
        distance_unit: "mile"
      }]
    }
  }
});
// Validated before API call
```

**Migration**:
1. Review all geo targeting configurations
2. Ensure city radius is between 10-50 miles (or 17-80 km)
3. Ensure custom location radius is between 0.63-50 miles (or 1-80 km)

##### 2. New Optional Ad Set Parameters

**`destination_type`** - Specify click destination:
```typescript
await meta_create_adset({
  name: "Messenger Campaign",
  campaign_id: "123456789",
  optimization_goal: "EVENT_RESPONSES",
  destination_type: "MESSENGER", // New parameter
  billing_event: "IMPRESSIONS",
  targeting: {...},
  daily_budget: 1000
});
```

**`is_dynamic_creative`** - Enable Advantage+ dynamic creative:
```typescript
await meta_create_adset({
  name: "Dynamic Ad Set",
  campaign_id: "123456789",
  optimization_goal: "LINK_CLICKS",
  is_dynamic_creative: true, // New parameter (creation only)
  billing_event: "IMPRESSIONS",
  targeting: {...},
  daily_budget: 1000
});
```

**Important**: `is_dynamic_creative` can only be set at creation. It cannot be changed later.

**`pacing_type`** - Control delivery speed:
```typescript
await meta_create_adset({
  name: "Accelerated Ad Set",
  campaign_id: "123456789",
  optimization_goal: "REACH",
  pacing_type: "no_pacing", // New parameter
  billing_event: "IMPRESSIONS",
  targeting: {...},
  daily_budget: 1000
});
```

**Migration**: No action required. These are optional parameters.

##### 3. Enhanced Promoted Object Validation

**Breaking Change**: `EVENT_RESPONSES` optimization goal no longer supports `promoted_object.event_id`.

**Before**:
```typescript
await meta_create_adset({
  optimization_goal: "EVENT_RESPONSES",
  promoted_object: {
    event_id: "123456789" // This will now fail validation
  }
});
// Error: EVENT_RESPONSES doesn't support event_id
```

**Now**:
```typescript
// For Event Response campaigns, link the event in the creative URL instead
await meta_create_adset({
  optimization_goal: "EVENT_RESPONSES",
  // No promoted_object with event_id
});

// Then create creative with event link:
await meta_create_ad_creative({
  object_story_spec: {
    page_id: "987654321",
    link_data: {
      link: "https://facebook.com/events/123456789" // Event link here
    }
  }
});
```

**Migration**:
1. Review all `EVENT_RESPONSES` ad sets
2. Remove `event_id` from `promoted_object`
3. Add event link to creative `link_data.link` instead

---

#### Ad Set Update Changes

**New Parameters**: `pacing_type` and `promoted_object` are now available on `meta_update_adset`:

```typescript
await meta_update_adset({
  adset_id: "123456789",
  pacing_type: "standard",
  promoted_object: {
    pixel_id: "987654321",
    custom_event_type: "PURCHASE"
  }
});
```

**Migration**: No action required. These are optional parameters.

---

## Validation Changes Summary

| Validation | Impact | Action Required |
|-----------|--------|-----------------|
| `special_ad_category_country` required | Breaking | Add country codes to special ad campaigns |
| Geo radius validation | Breaking | Ensure radius values are within limits |
| `EVENT_RESPONSES` + `event_id` blocked | Breaking | Move event_id from promoted_object to creative URL |
| Advantage+ `age_max` must be 65 | Existing (documented) | Set advantage_audience=0 for restrictive targeting |

## Testing Your Migration

After updating your code, test with:

```bash
# Run test suite
pnpm test

# Test campaign creation
await meta_create_campaign({
  name: "Test Campaign",
  objective: "OUTCOME_TRAFFIC",
  status: "PAUSED",
  daily_budget: 1000
});

# Test ad set creation with new parameters
await meta_create_adset({
  name: "Test Ad Set",
  campaign_id: campaign_id,
  optimization_goal: "LINK_CLICKS",
  billing_event: "IMPRESSIONS",
  destination_type: "WEBSITE",
  pacing_type: "standard",
  targeting: {
    geo_locations: { countries: ["US"] },
    age_min: 21,
    age_max: 65
  },
  daily_budget: 1000
});
```

## Getting Help

If you encounter issues during migration:

1. Check [PARAMETERS.md](PARAMETERS.md) for detailed parameter documentation
2. Review [CHANGELOG.md](../CHANGELOG.md) for recent changes
3. Examine error messages - validation now provides clearer guidance
4. Open an issue on GitHub with your migration question
