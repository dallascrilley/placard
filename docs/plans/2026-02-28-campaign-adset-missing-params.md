# Campaign & Ad Set Missing Parameters Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add missing parameters (`bid_strategy`, `promoted_object`, `start_time`/`stop_time`) to campaign and ad set tools so end-to-end campaign creation works without raw Graph API fallback.

**Architecture:** Each issue adds optional parameters to existing Zod schemas, passes them through the tool handler to `MetaClient`, and extends the client's `data` type + body construction. A new `PromotedObject` interface and `CUSTOM_EVENT_TYPES` constant are shared across campaign and ad set tools. The Advantage+ age constraint is handled via pre-validation in the ad set handler.

**Tech Stack:** TypeScript, Zod schemas, Vitest, Meta Graph API v22.0

---

## Overview of Changes

| Issue | Tool(s) | Parameter(s) | Priority |
|-------|---------|-------------|----------|
| #24 | `meta_create_campaign` | `bid_strategy` | High |
| #25 | `meta_create_adset` | `promoted_object` | Critical |
| #26 | `meta_update_campaign` | `bid_strategy` | High |
| #27 | `meta_create_campaign`, `meta_update_campaign` | `start_time`, `stop_time` | Medium |
| #28 | `meta_create_campaign` | `promoted_object` | Medium |
| #29 | `meta_create_adset` | Advantage+ age_max validation + docs | Low |

## Shared Setup

Before the individual tasks, we need the `PromotedObject` type and `CUSTOM_EVENT_TYPES` constant that #25 and #28 both use.

---

### Task 1: Add `PromotedObject` type and `CUSTOM_EVENT_TYPES` constant

**Files:**
- Modify: `src/types/meta-api.ts:182` (after Campaign interface)
- Modify: `src/constants/index.ts:188` (after BID_STRATEGIES)

**Step 1: Add PromotedObject interface to types**

In `src/types/meta-api.ts`, add after the `Campaign` interface (line ~182):

```typescript
// Promoted object for campaign/ad set level
export interface PromotedObject {
  pixel_id?: string;
  custom_event_type?: string;
  event_id?: string;
  application_id?: string;
  object_store_url?: string;
  offer_id?: string;
  page_id?: string;
}
```

Also add `promoted_object?: PromotedObject;` to the `AdSet` interface (after `bid_amount` at line ~194) and to the `Campaign` interface (after `special_ad_category_country` at line ~181).

**Step 2: Add CUSTOM_EVENT_TYPES constant**

In `src/constants/index.ts`, add after `BID_STRATEGIES` (line ~188):

```typescript
/**
 * Valid custom event types for promoted_object.
 */
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
```

**Step 3: Commit**

```bash
git add src/types/meta-api.ts src/constants/index.ts
git commit -m "feat: add PromotedObject type and CUSTOM_EVENT_TYPES constant"
```

---

### Task 2: Add `bid_strategy` to `meta_create_campaign` (GH#24)

**Files:**
- Modify: `src/tools/campaigns.ts:334-400` (schema + handler)
- Modify: `src/api/meta-client.ts:239-268` (createCampaign method)
- Test: `src/__tests__/api/meta-client.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/api/meta-client.test.ts`, inside the `describe("createCampaign", ...)` block (after line ~446):

```typescript
it("should pass bid_strategy when provided", async () => {
  mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

  const client = new MetaClient({ accessToken: "token" });
  await client.createCampaign("act_123", {
    name: "Test",
    objective: "OUTCOME_SALES",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  });

  const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
  const body = JSON.parse(options.body as string);
  expect(body.bid_strategy).toBe("LOWEST_COST_WITHOUT_CAP");
});

it("should not include bid_strategy when not provided", async () => {
  mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

  const client = new MetaClient({ accessToken: "token" });
  await client.createCampaign("act_123", {
    name: "Test",
    objective: "OUTCOME_SALES",
  });

  const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
  const body = JSON.parse(options.body as string);
  expect(body.bid_strategy).toBeUndefined();
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: FAIL — `bid_strategy` not in data type signature

**Step 3: Update `MetaClient.createCampaign()` data type and body**

In `src/api/meta-client.ts`, update the `createCampaign` method:

1. Add to the `data` parameter type (line ~248):
   ```typescript
   bid_strategy?: string | undefined;
   ```

2. Add to the body construction (after `lifetime_budget` check, line ~262):
   ```typescript
   if (data.bid_strategy !== undefined) {
     body["bid_strategy"] = data.bid_strategy;
   }
   ```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Update campaign tool schema and handler**

In `src/tools/campaigns.ts`:

1. Add to the Zod schema (after `lifetime_budget` at line ~355):
   ```typescript
   bid_strategy: z
     .enum(BID_STRATEGIES)
     .optional()
     .describe(
       "Bid strategy for the campaign. Options: LOWEST_COST_WITHOUT_CAP (default, recommended), LOWEST_COST_WITH_BID_CAP, COST_CAP, LOWEST_COST_WITH_MIN_ROAS",
     ),
   ```

2. Add `bid_strategy` to the handler destructuring (line ~370):
   ```typescript
   { account_id, name, objective, status, special_ad_categories, daily_budget, lifetime_budget, bid_strategy },
   ```

3. Add `bid_strategy` to the `client.createCampaign()` call (line ~400):
   ```typescript
   bid_strategy,
   ```

4. Update the tool description to document the parameter (add after lifetime_budget docs, line ~312):
   ```
   - bid_strategy (string, optional): Bid strategy for the campaign. Options: LOWEST_COST_WITHOUT_CAP (default, recommended for most campaigns), LOWEST_COST_WITH_BID_CAP (requires bid_amount on ad sets), COST_CAP, LOWEST_COST_WITH_MIN_ROAS
   ```

5. Add an example to the description:
   ```
   - With bid strategy: { "account_id": "act_123", "name": "Sales Campaign", "objective": "OUTCOME_SALES", "daily_budget": 5000, "bid_strategy": "LOWEST_COST_WITHOUT_CAP" }
   ```

**Step 6: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/tools/campaigns.ts src/api/meta-client.ts src/__tests__/api/meta-client.test.ts
git commit -m "feat(campaigns): add bid_strategy param to create_campaign

Closes #24"
```

---

### Task 3: Add `promoted_object` to `meta_create_adset` (GH#25)

**Files:**
- Modify: `src/tools/adsets.ts:234-310` (schema + handler)
- Modify: `src/api/meta-client.ts:356-396` (createAdSet method)
- Modify: `src/schemas/common.ts` (add promotedObjectSchema)
- Test: `src/__tests__/api/meta-client.test.ts`

**Step 1: Add `promotedObjectSchema` to common schemas**

In `src/schemas/common.ts`, add a reusable Zod schema (will be used by both campaign and ad set):

```typescript
import { CUSTOM_EVENT_TYPES } from "../constants/index.js";

/**
 * Promoted object schema for campaign/ad set level.
 */
export const promotedObjectSchema = z
  .object({
    pixel_id: z.string().optional().describe("Facebook Pixel ID for conversion tracking"),
    custom_event_type: z
      .enum(CUSTOM_EVENT_TYPES)
      .optional()
      .describe("Conversion event type (required with pixel_id)"),
    event_id: z.string().optional().describe("Facebook Event ID"),
    application_id: z.string().optional().describe("App ID for app promotion campaigns"),
    object_store_url: z.string().optional().describe("App store URL"),
    offer_id: z.string().optional().describe("Offer ID"),
    page_id: z.string().optional().describe("Facebook Page ID"),
  })
  .optional()
  .describe("Promoted object — required for conversion, event, and app campaigns");
```

**Step 2: Write the failing test**

In `src/__tests__/api/meta-client.test.ts`, find or add a `describe("createAdSet", ...)` block:

```typescript
describe("createAdSet", () => {
  it("should pass promoted_object when provided", async () => {
    mockFetch.mockResolvedValue(createMockResponse({ body: { id: "adset_123" } }));

    const client = new MetaClient({ accessToken: "token" });
    await client.createAdSet("act_123", {
      name: "Conversions Ad Set",
      campaign_id: "camp_123",
      optimization_goal: "OFFSITE_CONVERSIONS",
      billing_event: "IMPRESSIONS",
      targeting: { geo_locations: { countries: ["US"] } },
      promoted_object: {
        pixel_id: "pixel_456",
        custom_event_type: "PURCHASE",
      },
    });

    const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.promoted_object).toEqual({
      pixel_id: "pixel_456",
      custom_event_type: "PURCHASE",
    });
  });

  it("should not include promoted_object when not provided", async () => {
    mockFetch.mockResolvedValue(createMockResponse({ body: { id: "adset_123" } }));

    const client = new MetaClient({ accessToken: "token" });
    await client.createAdSet("act_123", {
      name: "Basic Ad Set",
      campaign_id: "camp_123",
      optimization_goal: "LINK_CLICKS",
      billing_event: "IMPRESSIONS",
      targeting: { geo_locations: { countries: ["US"] } },
    });

    const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.promoted_object).toBeUndefined();
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: FAIL — `promoted_object` not in data type

**Step 4: Update `MetaClient.createAdSet()` data type and body**

In `src/api/meta-client.ts`, update the `createAdSet` method:

1. Add to the `data` parameter type (after `end_time`, line ~371):
   ```typescript
   promoted_object?: object | undefined;
   ```

2. Add to body construction (after `end_time` check, line ~390):
   ```typescript
   if (data.promoted_object !== undefined) {
     body["promoted_object"] = JSON.stringify(data.promoted_object);
   }
   ```

   **Important:** The Meta Graph API requires `promoted_object` as a JSON-serialized string, not a nested object.

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: PASS

**Step 6: Update ad set tool schema and handler**

In `src/tools/adsets.ts`:

1. Import `promotedObjectSchema` from schemas:
   ```typescript
   import { promotedObjectSchema } from "../schemas/common.js";
   ```

2. Add to the Zod schema (after `end_time` at line ~260):
   ```typescript
   promoted_object: promotedObjectSchema,
   ```

3. Add `promoted_object` to the handler destructuring (line ~281):
   ```typescript
   { account_id, name, campaign_id, optimization_goal, billing_event, targeting, status, daily_budget, lifetime_budget, bid_amount, bid_strategy, start_time, end_time, promoted_object },
   ```

4. Add `promoted_object` to the `client.createAdSet()` call (line ~298):
   ```typescript
   promoted_object,
   ```

5. Update the tool description to document the parameter (add after `end_time` docs, line ~212):
   ```
   - promoted_object (object, optional): Promoted object for conversion/event/app ad sets. Required for OFFSITE_CONVERSIONS optimization. Fields: pixel_id (string), custom_event_type (PURCHASE, LEAD, COMPLETE_REGISTRATION, ADD_TO_CART, INITIATE_CHECKOUT, SEARCH, ADD_PAYMENT_INFO, ADD_TO_WISHLIST, CONTENT_VIEW, OTHER), event_id (string), application_id (string), object_store_url (string), offer_id (string), page_id (string)
   ```

6. Add an example:
   ```
   - Purchase conversion ad set: { "account_id": "act_123", "name": "Purchase Conversions", "campaign_id": "987", "optimization_goal": "OFFSITE_CONVERSIONS", "billing_event": "IMPRESSIONS", "targeting": { "geo_locations": { "countries": ["US"] } }, "daily_budget": 2500, "promoted_object": { "pixel_id": "123456", "custom_event_type": "PURCHASE" } }
   ```

**Step 7: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add src/schemas/common.ts src/tools/adsets.ts src/api/meta-client.ts src/__tests__/api/meta-client.test.ts
git commit -m "feat(adsets): add promoted_object param to create_adset

Required for OFFSITE_CONVERSIONS, EVENT_RESPONSES, and APP_INSTALLS
optimization goals. The promoted_object is JSON-serialized before
sending to the Graph API.

Closes #25"
```

---

### Task 4: Add `bid_strategy` to `meta_update_campaign` (GH#26)

**Files:**
- Modify: `src/tools/campaigns.ts:448-485` (schema + handler)
- Modify: `src/api/meta-client.ts:273-295` (updateCampaign method)
- Test: `src/__tests__/api/meta-client.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/api/meta-client.test.ts`, inside `describe("updateCampaign", ...)`:

```typescript
it("should pass bid_strategy when provided", async () => {
  mockFetch.mockResolvedValue(createMockResponse({ body: { success: true } }));

  const client = new MetaClient({ accessToken: "token" });
  await client.updateCampaign("camp_123", {
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  });

  const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
  const body = JSON.parse(options.body as string);
  expect(body.bid_strategy).toBe("LOWEST_COST_WITHOUT_CAP");
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: FAIL

**Step 3: Update `MetaClient.updateCampaign()` data type and body**

In `src/api/meta-client.ts`:

1. Add to the `data` parameter type (line ~280):
   ```typescript
   bid_strategy?: string | undefined;
   ```

2. Add to body construction (after `lifetime_budget` check, line ~289):
   ```typescript
   if (data.bid_strategy !== undefined) body["bid_strategy"] = data.bid_strategy;
   ```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Update campaign tool schema and handler**

In `src/tools/campaigns.ts`, in the `meta_update_campaign` definition:

1. Add to the Zod schema (after `lifetime_budget`, line ~460):
   ```typescript
   bid_strategy: z
     .enum(BID_STRATEGIES)
     .optional()
     .describe("New bid strategy"),
   ```

2. Add `bid_strategy` to the handler destructuring (line ~467):
   ```typescript
   { campaign_id, name, status, daily_budget, lifetime_budget, bid_strategy },
   ```

3. Add `bid_strategy` to the `client.updateCampaign()` call (line ~474):
   ```typescript
   bid_strategy,
   ```

4. Update the tool description to document the parameter (line ~428):
   ```
   - bid_strategy (string, optional): New bid strategy - LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP, LOWEST_COST_WITH_MIN_ROAS
   ```

**Step 6: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/tools/campaigns.ts src/api/meta-client.ts src/__tests__/api/meta-client.test.ts
git commit -m "feat(campaigns): add bid_strategy param to update_campaign

Closes #26"
```

---

### Task 5: Add `start_time`/`stop_time` to campaign tools (GH#27)

**Files:**
- Modify: `src/tools/campaigns.ts` (both create and update schemas + handlers)
- Modify: `src/api/meta-client.ts` (both createCampaign and updateCampaign methods)
- Test: `src/__tests__/api/meta-client.test.ts`

**Important note:** The Meta Graph API uses `stop_time` (not `end_time`) for campaigns. Ad sets use `end_time`. This is an API inconsistency from Meta. We expose `stop_time` on campaigns to match the API.

**Step 1: Write the failing tests**

In `src/__tests__/api/meta-client.test.ts`:

Inside `describe("createCampaign", ...)`:
```typescript
it("should pass start_time and stop_time when provided", async () => {
  mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

  const client = new MetaClient({ accessToken: "token" });
  await client.createCampaign("act_123", {
    name: "Scheduled Campaign",
    objective: "OUTCOME_SALES",
    daily_budget: 5000,
    start_time: "2026-03-01T00:00:00+0000",
    stop_time: "2026-03-15T23:59:59+0000",
  });

  const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
  const body = JSON.parse(options.body as string);
  expect(body.start_time).toBe("2026-03-01T00:00:00+0000");
  expect(body.stop_time).toBe("2026-03-15T23:59:59+0000");
});
```

Inside `describe("updateCampaign", ...)`:
```typescript
it("should pass start_time and stop_time when provided", async () => {
  mockFetch.mockResolvedValue(createMockResponse({ body: { success: true } }));

  const client = new MetaClient({ accessToken: "token" });
  await client.updateCampaign("camp_123", {
    stop_time: "2026-04-01T00:00:00+0000",
  });

  const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
  const body = JSON.parse(options.body as string);
  expect(body.stop_time).toBe("2026-04-01T00:00:00+0000");
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: FAIL

**Step 3: Update `MetaClient.createCampaign()` and `MetaClient.updateCampaign()`**

In `src/api/meta-client.ts`:

For `createCampaign` — add to data type:
```typescript
start_time?: string | undefined;
stop_time?: string | undefined;
```

Add to body construction:
```typescript
if (data.start_time !== undefined) body["start_time"] = data.start_time;
if (data.stop_time !== undefined) body["stop_time"] = data.stop_time;
```

For `updateCampaign` — add to data type:
```typescript
start_time?: string | undefined;
stop_time?: string | undefined;
```

Add to body construction:
```typescript
if (data.start_time !== undefined) body["start_time"] = data.start_time;
if (data.stop_time !== undefined) body["stop_time"] = data.stop_time;
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Update campaign tool schemas and handlers**

In `src/tools/campaigns.ts`:

For `meta_create_campaign` — add to Zod schema (after `bid_strategy`):
```typescript
start_time: z
  .string()
  .optional()
  .describe("Campaign start time in ISO 8601 format (e.g., '2026-03-01T00:00:00+0000')"),
stop_time: z
  .string()
  .optional()
  .describe("Campaign stop time in ISO 8601 format (e.g., '2026-03-15T23:59:59+0000')"),
```

Add `start_time, stop_time` to handler destructuring and pass to `client.createCampaign()`.

For `meta_update_campaign` — same additions to schema, handler, and client call.

Update both tool descriptions to document the new parameters.

**Step 6: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/tools/campaigns.ts src/api/meta-client.ts src/__tests__/api/meta-client.test.ts
git commit -m "feat(campaigns): add start_time/stop_time to create and update campaign

Enables scheduling campaigns with specific date ranges. Uses stop_time
(not end_time) to match Meta Graph API naming for campaigns.

Closes #27"
```

---

### Task 6: Add `promoted_object` to `meta_create_campaign` (GH#28)

**Files:**
- Modify: `src/tools/campaigns.ts:334-400` (schema + handler)
- Modify: `src/api/meta-client.ts:239-268` (createCampaign method)
- Test: `src/__tests__/api/meta-client.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/api/meta-client.test.ts`, inside `describe("createCampaign", ...)`:

```typescript
it("should pass promoted_object when provided", async () => {
  mockFetch.mockResolvedValue(createMockResponse({ body: { id: "123" } }));

  const client = new MetaClient({ accessToken: "token" });
  await client.createCampaign("act_123", {
    name: "Event Campaign",
    objective: "OUTCOME_ENGAGEMENT",
    daily_budget: 5000,
    promoted_object: { event_id: "event_789" },
  });

  const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
  const body = JSON.parse(options.body as string);
  expect(body.promoted_object).toBe(JSON.stringify({ event_id: "event_789" }));
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: FAIL

**Step 3: Update `MetaClient.createCampaign()`**

Add to data type:
```typescript
promoted_object?: object | undefined;
```

Add to body construction:
```typescript
if (data.promoted_object !== undefined) {
  body["promoted_object"] = JSON.stringify(data.promoted_object);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/meta-client.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Update campaign tool schema and handler**

In `src/tools/campaigns.ts`, add to `meta_create_campaign`:

1. Import `promotedObjectSchema` from schemas (if not already imported via Task 3).

2. Add to Zod schema:
   ```typescript
   promoted_object: promotedObjectSchema,
   ```

3. Add `promoted_object` to handler destructuring and pass to `client.createCampaign()`.

4. Update tool description to document the parameter.

**Step 6: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/tools/campaigns.ts src/api/meta-client.ts src/__tests__/api/meta-client.test.ts
git commit -m "feat(campaigns): add promoted_object param to create_campaign

Supports event_id for OUTCOME_ENGAGEMENT campaigns and application_id
for OUTCOME_APP_PROMOTION campaigns at the campaign level.

Closes #28"
```

---

### Task 7: Add Advantage+ age_max validation and docs to `meta_create_adset` (GH#29)

**Files:**
- Modify: `src/tools/adsets.ts:195-310` (tool description + handler validation)
- Test: `src/__tests__/api/meta-client.test.ts` or a new test file for tool-level validation

**Step 1: Update tool description**

In `src/tools/adsets.ts`, in the `meta_create_adset` description, add a note after the targeting parameter description (line ~205):

```
Note: When using Advantage+ audience (targeting.targeting_automation.advantage_audience = 1 or omitted), age_max must be 65. Meta will reject age_max < 65 with "Maximum age is below threshold". If you need restrictive age targeting, set targeting_automation.advantage_audience = 0.
```

**Step 2: Add pre-validation in the handler**

In `src/tools/adsets.ts`, in the `meta_create_adset` handler (after `normalizeAccountId`, line ~284), add:

```typescript
// Validate Advantage+ audience age constraint
const t = targeting as Record<string, unknown>;
const automation = t?.targeting_automation as Record<string, unknown> | undefined;
const advantageAudience = automation?.advantage_audience;
const ageMax = t?.age_max as number | undefined;

if (ageMax !== undefined && ageMax < 65) {
  // If advantage_audience is not explicitly set to 0, warn about the constraint
  if (advantageAudience === undefined || advantageAudience !== 0) {
    return createErrorResponse(
      new Error(
        `age_max (${ageMax}) is below 65. With Advantage+ audience (the default), Meta requires age_max to be 65. ` +
        `Either set age_max to 65 (Meta uses it as a suggestion) or set targeting.targeting_automation.advantage_audience to 0 to disable Advantage+ audience.`,
      ),
      format,
    );
  }
}
```

**Step 3: Write test for the validation**

This is tool-level validation, so we need a tool-level test. Create a simple test that validates the logic. Since tool-level tests require server setup, add a focused unit test for the validation logic:

In `src/__tests__/tools/adsets.test.ts` (new file):

```typescript
import { describe, expect, it } from "vitest";

/**
 * Advantage+ audience age validation logic.
 * Extracted here for testability — mirrors the check in adsets.ts handler.
 */
function validateAdvantageAgeConstraint(
  targeting: Record<string, unknown>,
): string | null {
  const automation = targeting?.targeting_automation as Record<string, unknown> | undefined;
  const advantageAudience = automation?.advantage_audience;
  const ageMax = targeting?.age_max as number | undefined;

  if (ageMax !== undefined && ageMax < 65) {
    if (advantageAudience === undefined || advantageAudience !== 0) {
      return `age_max (${ageMax}) is below 65. With Advantage+ audience (the default), Meta requires age_max to be 65.`;
    }
  }
  return null;
}

describe("Advantage+ audience age validation", () => {
  it("should reject age_max < 65 when advantage_audience is not set", () => {
    const result = validateAdvantageAgeConstraint({ age_min: 25, age_max: 45 });
    expect(result).toContain("age_max (45) is below 65");
  });

  it("should reject age_max < 65 when advantage_audience is 1", () => {
    const result = validateAdvantageAgeConstraint({
      age_min: 25,
      age_max: 45,
      targeting_automation: { advantage_audience: 1 },
    });
    expect(result).toContain("age_max (45) is below 65");
  });

  it("should allow age_max < 65 when advantage_audience is 0", () => {
    const result = validateAdvantageAgeConstraint({
      age_min: 25,
      age_max: 45,
      targeting_automation: { advantage_audience: 0 },
    });
    expect(result).toBeNull();
  });

  it("should allow age_max = 65 with advantage_audience", () => {
    const result = validateAdvantageAgeConstraint({ age_min: 25, age_max: 65 });
    expect(result).toBeNull();
  });

  it("should allow no age_max at all", () => {
    const result = validateAdvantageAgeConstraint({ age_min: 25 });
    expect(result).toBeNull();
  });
});
```

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/tools/adsets.test.ts --reporter=verbose`
Expected: All PASS

**Step 5: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/tools/adsets.ts src/__tests__/tools/adsets.test.ts
git commit -m "docs(adsets): add Advantage+ age_max constraint validation

Adds pre-flight check and documentation for the common pitfall where
age_max < 65 fails with Advantage+ audience enabled (the default).

Closes #29"
```

---

## Final Verification

After all tasks are complete:

1. Run the full test suite: `npx vitest run --reporter=verbose`
2. Run type checking: `npx tsc --noEmit`
3. Run lint: `npx eslint src/`
4. Verify the build: `npm run build`

All 6 issues should be addressable in a single feature branch and PR.
