# Batch Campaign Workflow

Documentation for `meta_create_campaign_from_config` and related validation behaviors.

## Tool Overview

`meta_create_campaign_from_config` creates a full campaign hierarchy from a single config: shared creatives, campaigns, ad sets, and ads. Execution is tiered and parallel within each tier.

## Execution Order & Failure Handling

### Tier Order

1. **Shared creatives** (parallel via `Promise.allSettled`)
2. **Campaigns** (parallel)
3. **Ad sets** (parallel)
4. **Ads** (parallel)

### On Tier Failure

- Execution **stops** at the first tier where one or more calls fail.
- All resources created in prior tiers are **retained** (no automated rollback).
- The response includes:
  - `completed: false`
  - `created[]` – IDs of successfully created resources
  - `error.tier` – which tier failed (e.g. `"ad_sets"`)
  - `error.message` – failure details
  - `error.rollback_hints` – manual recovery guidance

### Rollback Hints (Manual Only)

Rollback hints are **informational**. There is **no automated rollback**.

| Tier Failed | Rollback Hints |
|-------------|----------------|
| shared_creatives | Creatives may exist; Meta does not support deleting creatives – archive/ignore IDs on retry |
| campaigns | Archive or delete created campaigns before re-running |
| ad_sets | Delete partial ad sets and campaigns if full rollback is required |
| ads | Delete partial ads/ad sets/campaigns; archive creatives (non-deletable) |

**Manual recovery**: Use `meta_delete_campaign` / `meta_delete_adset` / `meta_delete_ad` for the IDs in `created[]`. Creatives cannot be deleted; document them and exclude from retry config.

## Dry-Run Scope & Limitations

**`dry_run: true`** runs validation only; no Meta API calls.

### What Dry-Run Validates

- Config schema (Zod)
- Business rules: budget constraints, CBO compatibility, geo radius, promoted_object/destination_type guidelines
- Creative ref resolution, image_key mapping
- Exactly-one creative source per ad

### What Dry-Run Does Not Validate

- **API limits** (e.g. account spend caps, rate limits)
- **Permissions** (e.g. missing `ads_management` scope)
- **Live campaign state** (e.g. duplicate names, policy holds)
- **Network / auth** (token validity, connectivity)

A passing dry-run does **not** guarantee a successful live run. Use dry-run for pre-flight schema and business-rule checks; treat live failures as possible and handle via retries or manual rollback.

## Validation: Warnings vs Errors

### Errors (Block Execution)

- Schema violations
- Missing required fields
- Invalid creative_ref references
- CBO budget conflicts
- Geo radius out of range

When `valid: false`, the batch does not call the Meta API.

### Warnings (Do Not Block)

| Condition | Rationale |
|-----------|-----------|
| `EVENT_RESPONSES` + `promoted_object.event_id` | Meta API rejects this combo. We warn but allow creation; Meta will reject if actually invalid. |
| `EVENT_RESPONSES` + `destination_type` missing or not `ON_EVENT` | Meta recommends `ON_EVENT` for event-response flows; wrong value may underperform. |
| `creatives` alias used | Deprecated; prefer `shared_creatives`. |

### Response Semantics

- **Dry-run**: `valid`, `errors`, `warnings`, `summary` – no `completed` (no execution).
- **Live with validation failure**: `completed: false`, `valid: false`, `errors`, `warnings`, `error.rollback_hints` – no API calls.
- **Live with execution failure**: `completed: false`, `created[]`, `error.tier`, `error.rollback_hints` – partial resources exist.
- **Live success**: `completed: true`, `created[]`, optional `warnings` – full hierarchy created.

Warnings do **not** change `completed`. A run with warnings but no errors is reported as `completed: true` if all tiers succeed.

## Promoted Object & Event-Response Validation

### Why Warnings, Not Errors

1. **`promoted_object.event_id` with EVENT_RESPONSES**: Meta’s API rejects this. We warn so tooling can surface it, but we do not block creation. Callers can still attempt creation for non-standard setups (e.g. different API versions).
2. **`destination_type` for EVENT_RESPONSES**: Meta recommends `ON_EVENT`; other values may work but underperform. We warn to nudge correct configuration without blocking.

### Visibility

- Batch: `warnings[]` in the response, with `path` and `message`.
- `meta_create_adset`: warnings in the success payload.
- README and PARAMETERS.md document these constraints.

## Config Schema Quick Reference

```json
{
  "image_hashes": { "hero_image": "hash_xxx" },
  "shared_creatives": [
    {
      "ref": "hero",
      "name": "Hero",
      "page_id": "123",
      "link": "https://example.com",
      "message": "Shop now"
    }
  ],
  "campaigns": [
    {
      "name": "Campaign A",
      "objective": "OUTCOME_TRAFFIC",
      "daily_budget": 5000,
      "ad_sets": [
        {
          "name": "Ad Set A",
          "optimization_goal": "LINK_CLICKS",
          "billing_event": "IMPRESSIONS",
          "targeting": { "geo_locations": { "countries": ["US"] }, "age_min": 25, "age_max": 65 },
          "ads": [{ "name": "Ad A", "creative_ref": "hero" }]
        }
      ]
    }
  ]
}
```

See `src/schemas/batch.ts` and `docs/PARAMETERS.md` for full field descriptions.

## Composite Helpers (Optional Pre-Checks)

- **`meta_validate_campaign_config`**: Validates a single campaign config (budget, objective, targeting, reach estimate). Does not validate batch hierarchy.
- **`meta_verify_campaign_structure`**: Verifies existing campaigns against expected structure. Use after creation or for audits.
- **`meta_generate_budget_phase_plan`**: Builds budget phase plans; optional `execute_now` to apply updates.

These are **optional**; `meta_create_campaign_from_config` with `dry_run: true` is the main pre-flight for batch creation.
