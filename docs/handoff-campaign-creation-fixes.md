# Handoff: Campaign Creation Fixes

**Context**: After 4 attempts to create a full bridal show campaign (4 campaigns, 6 ad sets, 8+ ads) via MCP tools, we've cataloged every API error and MCP limitation encountered. This document captures what needs fixing, with exact file/line references and reproduction steps.

**Priority**: Fix #1 and #2 first — they blocked the most recent campaign creation attempt.

---

## Fix #1: `meta_create_ad_creative` silently drops fields (HIGH)

### Problem
The `createAdCreative` client method hardcodes only `name` + `object_story_spec` in the request body. Any other fields passed by the caller are silently dropped.

**Dropped fields include**: `asset_feed_spec`, `url_tags`, `instagram_actor_id`, `degrees_of_freedom_spec`, `applink_treatment`.

This means **dynamic creative is completely broken** — even when using the "correct" workflow (`meta_create_ad_creative` → `creative_id` → `meta_create_ad`), because `asset_feed_spec` never reaches the API.

### Where

**Client method** — `src/api/meta-client.ts:691-705`:
```typescript
async createAdCreative(
  accountId: string,
  data: {
    name: string;
    object_story_spec: object;
  },
): Promise<{ id: string }> {
  return this.request<{ id: string }>(`/${accountId}/adcreatives`, {
    method: "POST",
    body: {
      name: data.name,
      object_story_spec: data.object_story_spec,  // ONLY these two fields sent
    },
  });
}
```

**Tool schema** — `src/tools/creatives.ts:156-166`:
```typescript
{
  account_id: accountIdSchema,
  name: z.string().min(1).describe("Creative name"),
  object_story_spec: z.record(z.unknown()).describe("..."),
  // No asset_feed_spec, url_tags, etc.
}
```

### Fix

1. **Client**: Accept optional fields and pass them through:
```typescript
async createAdCreative(
  accountId: string,
  data: {
    name: string;
    object_story_spec?: object;
    asset_feed_spec?: object;
    url_tags?: string;
    instagram_actor_id?: string;
    degrees_of_freedom_spec?: object;
    applink_treatment?: string;
  },
): Promise<{ id: string }> {
  const body: Record<string, unknown> = { name: data.name };
  if (data.object_story_spec) body.object_story_spec = data.object_story_spec;
  if (data.asset_feed_spec) body.asset_feed_spec = data.asset_feed_spec;
  if (data.url_tags) body.url_tags = data.url_tags;
  if (data.instagram_actor_id) body.instagram_actor_id = data.instagram_actor_id;
  if (data.degrees_of_freedom_spec) body.degrees_of_freedom_spec = data.degrees_of_freedom_spec;
  if (data.applink_treatment) body.applink_treatment = data.applink_treatment;
  return this.request<{ id: string }>(`/${accountId}/adcreatives`, {
    method: "POST",
    body,
  });
}
```

2. **Tool schema**: Add `asset_feed_spec` as optional parameter alongside `object_story_spec`. Make them mutually exclusive (like `creative_id` vs `creative` on `meta_create_ad`).

3. **Tool docstring**: Add examples showing both patterns:
   - Standard creative: `object_story_spec` with `page_id` + `link_data`
   - Dynamic creative: `asset_feed_spec` with `images`, `bodies`, `link_urls`, `call_to_action_types`

### Validation
- `object_story_spec` and `asset_feed_spec` should be mutually exclusive
- At least one of them is required

---

## Fix #2: `meta_create_ad` docstring is misleading (MEDIUM)

### Problem
The description says "inline creative specification" works, implying you can pass `asset_feed_spec` via the `creative` param. In practice, the generic `creative: z.record(z.unknown())` only works for `object_story_spec`-style creatives. `asset_feed_spec` must go through `meta_create_ad_creative` first.

### Where
`src/tools/ads.ts:184-196` — the tool description.

### Fix
Update the docstring to clarify:
```
- creative (object, optional): Inline creative using object_story_spec format.
  For dynamic creatives using asset_feed_spec, create the creative first with
  meta_create_ad_creative, then reference it via creative_id.
```

---

## Fix #3: `meta_create_adset` — add CBO budget warning (MEDIUM)

### Problem
When a campaign uses CBO (Campaign Budget Optimization — budget set at campaign level), ad sets must NOT have their own `daily_budget` or `lifetime_budget`. The tool blindly passes budget fields to the API, which returns:

> "An ad set in a campaign budget optimization campaign cannot have a budget."

No docstring warning, no validation.

### Where
- Schema: `src/tools/adsets.ts:290-291` (docstring), `334-335` (Zod schema)
- Client: `src/api/meta-client.ts:416-419`

### Fix options (pick one)

**Option A — Docstring only** (minimal):
Add to the `meta_create_adset` description:
```
Note: If the parent campaign uses Campaign Budget Optimization (CBO — budget set
at campaign level), do NOT set daily_budget or lifetime_budget on the ad set.
The API will reject it.
```

**Option B — Smart validation** (better UX):
1. Accept an optional `campaign_id` lookup
2. Before creating the ad set, GET the campaign to check if it has a budget
3. If campaign has budget AND ad set has budget → return error before hitting the API

Option A is probably sufficient — the LLM caller just needs to know.

---

## Fix #4: `stop_time` — clarify `daily_budget` limitation (MEDIUM)

### Problem
`stop_time` is wired up correctly in the code path (`src/api/meta-client.ts:278`), but it may only take effect on `lifetime_budget` campaigns. On `daily_budget` campaigns, Meta silently accepts it but never stops the campaign.

### Where
- Issue: #35
- Schema: `src/tools/campaigns.ts:383-388`
- Client: `src/api/meta-client.ts:278`

### Fix
1. Update the `stop_time` schema description:
```typescript
stop_time: z
  .string()
  .optional()
  .describe(
    "Campaign stop time in ISO 8601 format with timezone offset " +
    "(e.g., '2026-03-15T23:59:59+0000'). " +
    "Note: stop_time may only be enforced on lifetime_budget campaigns. " +
    "For daily_budget campaigns, consider scheduling via Ads Manager."
  ),
```

2. Add validation: if `stop_time` is provided without a timezone offset (no `+` or `-` after the time), warn or reject.

3. Test whether `stop_time` actually works on `daily_budget` campaigns and update #35 with findings.

---

## Fix #5: Document objective/optimization_goal compatibility (LOW — issue #32)

### Problem
There's no compatibility matrix showing which combinations of `objective`, `optimization_goal`, `billing_event`, `promoted_object`, and `destination_type` are valid. This causes repeated trial-and-error API rejections, especially for Event Response campaigns.

### Where
Issue: #32

### Fix
Add a compatibility table to the `meta_create_adset` docstring (or a separate reference tool):

```
Objective Compatibility Matrix:
┌──────────────────────┬──────────────────────┬────────────────┬───────────────────────────────────────┬──────────────────┐
│ Campaign Objective    │ optimization_goal    │ billing_event  │ promoted_object                       │ destination_type │
├──────────────────────┼──────────────────────┼────────────────┼───────────────────────────────────────┼──────────────────┤
│ OUTCOME_SALES        │ OFFSITE_CONVERSIONS  │ IMPRESSIONS    │ { pixel_id, custom_event_type }       │ WEBSITE          │
│ OUTCOME_ENGAGEMENT   │ EVENT_RESPONSES      │ IMPRESSIONS    │ NONE (event linked via creative)      │ omit (default)   │
│ OUTCOME_ENGAGEMENT   │ POST_ENGAGEMENT      │ IMPRESSIONS    │ { page_id }                           │ omit             │
│ OUTCOME_TRAFFIC      │ LINK_CLICKS          │ IMPRESSIONS    │ NONE                                  │ WEBSITE          │
│ OUTCOME_AWARENESS    │ REACH                │ IMPRESSIONS    │ NONE                                  │ omit             │
│ OUTCOME_LEADS        │ LEAD_GENERATION      │ IMPRESSIONS    │ { page_id }                           │ WEBSITE          │
└──────────────────────┴──────────────────────┴────────────────┴───────────────────────────────────────┴──────────────────┘
```

This could also live as validation logic — reject known-invalid combinations before hitting the API.

---

## Nice-to-have: `meta_validate_interest_ids` tool

### Problem
Interest IDs get deprecated silently. When used in targeting, the API returns "Interests with ID X is invalid" with no way to check beforehand.

### Fix
New tool wrapping the `adinterestvalid` search type (already in `TARGETING_TYPES`):
- Input: list of interest IDs
- Output: which are valid, which are deprecated, with suggested replacements via `adinterest` search

---

## Execution Order

1. **Fix #1** — `createAdCreative` field passthrough (unblocks dynamic creative)
2. **Fix #2** — `meta_create_ad` docstring (prevents confusion)
3. **Fix #3** — CBO budget warning on `meta_create_adset` (prevents common error)
4. **Fix #4** — `stop_time` clarification + timezone validation
5. **Fix #5** — compatibility matrix (reduces trial-and-error)

## Testing

After fixes, verify by creating a full campaign set:
1. Create `OUTCOME_SALES` campaign with CBO `daily_budget`
2. Create ad set with NO budget (CBO) + `targeting_automation.advantage_audience: 1`
3. Create standalone creative via `meta_create_ad_creative` with `object_story_spec`
4. Create ad referencing `creative_id`
5. Repeat for `OUTCOME_ENGAGEMENT` campaign with Event Response ad set
6. Verify `asset_feed_spec` creative creation works via `meta_create_ad_creative`
