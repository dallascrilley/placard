# Agent Friction Report — Meta Ads MCP Server

**Date**: 2026-02-28
**Source**: Real usage session — Claude Code agent querying past campaign data to audit trademark usage in ad copy across 4 show locations.

## Context

Task: pull all ad creatives from the account, extract body text, and check which show names use ™. Required iterating through campaigns → adsets → ads → creatives across multiple show locations spanning 2+ years of data.

---

## Issue 1: No cursor-based pagination (HIGH)

**Files**: `src/tools/creatives.ts:72-77`, `src/api/meta-client.ts:472-483`

`meta_get_ad_creatives` with `limit=100` returned 100 results and `has_more: true` with a `paging.cursors.after` value — but there's no `after` parameter to request the next page.

**Impact**: Could only access the most recent 100 creatives. Older Dallas and Las Colinas creatives (the whole point of the query) were unreachable.

**Applies to**: All list tools (`meta_get_campaigns`, `meta_get_ads`, `meta_get_adsets`, `meta_get_ad_creatives`).

**Fix**: Add `after` (and optionally `before`) cursor params to all list tool schemas. Thread through to the Graph API call. Pattern:

```typescript
// Schema
after: z.string().optional().describe("Pagination cursor from previous response"),

// Client
params: { fields: "...", limit, ...(after ? { after } : {}) }
```

---

## Issue 2: `meta_get_ads` doesn't filter by campaign_id (HIGH)

**Files**: `src/tools/ads.ts:75-80`, `src/api/meta-client.ts:388-407`

To get ads for a specific campaign, I had to:
1. `meta_get_adsets` with `campaign_id` filter → get adset IDs
2. `meta_get_ads` with `adset_id` filter → repeat per adset

That's 3+ API calls instead of 1. `meta_get_adsets` already supports `campaign_id` filtering — the pattern exists, it just wasn't applied to ads.

**Fix**: Add `campaign_id` to the `meta_get_ads` schema and filtering logic, mirroring `getAdSets`.

---

## Issue 3: No `asset_feed_spec` in creative fields (MEDIUM)

**File**: `src/api/meta-client.ts:476-479`

The hardcoded fields for `getAdCreatives` include `body`, `title`, and `object_story_spec` but not `asset_feed_spec`. Dynamic creative ads (which all our bridal show campaigns use) store their text variants, images, and CTAs in `asset_feed_spec`, not `object_story_spec`.

Fortunately `body` was populated as a top-level field, so I could still read the primary ad text. But for campaigns with multiple text variants in dynamic ads, the individual variants would be invisible.

**Fix**: Append `asset_feed_spec` to the fields string in `getAdCreatives`.

---

## Issue 4: `meta_get_ad_details` doesn't expand creative content (MEDIUM)

**File**: `src/api/meta-client.ts:412-419`

`meta_get_ad_details` returns `creative: { id: "..." }` — just the ID, no body text. To get the actual ad copy, you need a second call.

The Graph API supports field expansion: `creative{id,body,title,object_story_spec,asset_feed_spec}` would inline the creative content in one call.

**Fix**: Change the `creative` field to `creative{id,name,body,title,object_story_spec,asset_feed_spec}` in the fields string.

---

## Issue 5: Response size exceeds MCP limits (MEDIUM)

**File**: `src/utils/tool-responses.ts:192-217`

`meta_get_ad_creatives` with `limit=100` returned **258KB** of JSON, which exceeded the Claude Code MCP response limit. The output was dumped to a file on disk, forcing me to grep through it with shell commands instead of processing it directly.

The response includes heavy fields like `object_story_spec` with full image URLs, tracking specs, etc. — most of which I didn't need (I only wanted `body` text).

**Fix options** (not mutually exclusive):
1. Expose a `fields` parameter so agents can request only what they need (see Issue 6)
2. Add a `summary` response format that returns lightweight fields only
3. Add response size awareness — if payload exceeds ~100KB, warn or auto-truncate heavy fields

---

## Issue 6: No `fields` parameter on any non-insights tool (MEDIUM)

**Files**: All tool schemas; `src/schemas/common.ts:91-94` (defines unused `fieldsSchema`)

The insights tools accept a `fields` parameter for selecting specific metrics. No other tool does. The `fieldsSchema` is already defined in the shared schemas module but never wired into campaigns, adsets, ads, or creatives tools.

For an agent querying ad copy, I only needed `id,name,body` — not all 11 fields including `image_hash`, `thumbnail_url`, etc. Allowing field selection would:
- Reduce response sizes dramatically (fixing Issue 5)
- Make responses faster
- Let agents request exactly what they need

**Fix**: Wire `fieldsSchema` into all list/detail tools. Use it as an override for the hardcoded default fields.

---

## Workflow Friction (Not Code Bugs)

### OAuth state mismatch

The callback page showed "Invalid or expired state parameter" because the MCP server process that generated the login link and the callback page don't share state. The `meta_complete_auth` tool handled this gracefully — it accepted the raw code and exchanged it anyway. This is well-documented in the README.

**Suggestion**: The `meta_get_login_link` tool description should mention that if the callback page shows a state error, the code is still valid — just pass it to `meta_complete_auth`. Currently you have to know to try this.

### No "get all ads with creative content for a campaign" convenience tool

The most common agent workflow is: "show me all the ads in campaign X with their copy text." This currently requires:
1. `meta_get_adsets(campaign_id=X)`
2. `meta_get_ads(adset_id=Y)` per adset
3. `meta_get_ad_details(ad_id=Z)` per ad (which still doesn't include creative text)
4. `meta_get_ad_creatives(account_id=...)` and grep for matching IDs

**Suggestion**: Consider a `meta_get_campaign_ads` convenience tool that returns ads with inline creative content for an entire campaign in one call. The Graph API supports this via nested field expansion: `/campaign_id/ads?fields=name,creative{body,title,asset_feed_spec}`.

---

## Priority Summary

| Priority | Issue | Impact |
|----------|-------|--------|
| **P0** | #1 — No pagination cursors | Blocks access to historical data |
| **P0** | #2 — No campaign_id filter on ads | Forces multi-call workaround |
| **P1** | #6 — No fields parameter | Causes oversized responses |
| **P1** | #4 — No creative expansion in ad details | Forces extra API calls |
| **P1** | #3 — Missing asset_feed_spec | Breaks dynamic creative inspection |
| **P2** | #5 — Response size management | Degrades agent experience |
