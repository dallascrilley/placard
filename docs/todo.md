# TODO

## Post-Review Suggestions (2026-03-01)
- [x] Update batch rollback hints to clarify creatives are non-deletable on Meta
- [x] Add ad-account-timezone execution reminder to `meta_generate_budget_phase_plan`
- [x] Add regression assertions for rollback hint + timezone note
- [x] Run verification (`qa`)

## Review (Post-Review Suggestions)
- [x] Root-cause clarity fix: batch rollback guidance now explicitly states creatives are non-deletable and should be archived/ignored on retry.
- [x] Operator guidance fix: budget phase plans now include an execution note to run phase dates in ad-account timezone.
- [x] Validation evidence: targeted tests passed (`38/38`), `qa` passed (`typecheck`, lint warnings-only, `306` tests passed).

## Follow-up Completion: Remaining Campaign Friction (2026-03-01)
- [x] Add show-config friendly creative shorthand fields (`page_id`, `link`, `message`, `title`, `call_to_action_type`, `image_hash`/`image_key`) to batch schema
- [x] Add `creatives` alias for `shared_creatives` in batch config and enforce exclusivity
- [x] Update batch validation/execution to materialize shorthand creatives into `object_story_spec`
- [x] Add `meta_generate_budget_phase_plan` composite tool for dated phase transition update calls
- [x] Add regression coverage for creative alias/template behavior and budget phase planner tool
- [x] Re-run verification (`pnpm build`, `pnpm test`)

## Review (Follow-up Completion: Remaining Campaign Friction)
- [x] Root cause fixed: ad copy can now live directly in per-show batch config via creative shorthand instead of hand-building deep `object_story_spec` JSON.
- [x] Root cause fixed: budget phase transitions now have an explicit generated checklist + exact `meta_update_campaign` call payloads and dates.
- [x] Validation evidence: `pnpm build` passed; `pnpm test` passed (`13` files, `305` tests); lint remains warnings-only for pre-existing complexity rules.

## Plan: meta_create_campaign_from_config Batch Tool (2026-03-01)
- [x] Add batch config schema in `src/schemas/batch.ts` and export from `src/schemas/index.ts`
- [x] Implement `src/tools/batch.ts` (`validateConfig`, `executeBatch`, `registerBatchTools`)
- [x] Register batch tools in `src/server.ts`
- [x] Add `meta_verify_campaign_structure` tool in `src/tools/composite.ts`
- [x] Soften `validatePromotedObjectConstraints` to warning and thread warning response in `meta_create_adset`
- [x] Add tests in `src/__tests__/tools/batch.test.ts`
- [x] Update tool registration assertions in `src/__tests__/server.test.ts` and composite registration tests
- [x] Run verification (`pnpm build`, `pnpm test`)

## Review (Plan: meta_create_campaign_from_config Batch Tool)
- [x] Capture root cause/value summary and validation evidence

### Evidence
- Added `meta_create_campaign_from_config` batch tool with pre-flight validation, dry-run support, tiered execution, and partial-progress error reporting in `src/tools/batch.ts`.
- Added `meta_verify_campaign_structure` read-only verification tool in `src/tools/composite.ts`.
- Softened `promoted_object.event_id` constraint from blocking error to warning in `src/tools/adsets.ts` and included warnings in create response payload.
- Added batch schema + exports in `src/schemas/batch.ts` and `src/schemas/index.ts`.
- Updated registrations and expectations in `src/server.ts`, `src/__tests__/server.test.ts`, and `src/__tests__/tools/composite.test.ts`.
- Added targeted regression coverage in `src/__tests__/tools/batch.test.ts`.
- Validation: `pnpm lint` passed with complexity warnings only, `pnpm build` passed, `pnpm test` passed (`13` files, `289` tests).

## Follow-up Execution (2026-03-01)
- [x] Add `config_path` support to `meta_create_campaign_from_config` (file-based config input)
- [x] Add custom audience discovery path: `meta_get_custom_audiences`
- [x] Add regression tests for `config_path` and config/config_path exclusivity
- [x] Add API client tests for `getCustomAudiences`
- [x] Update server tool inventory count for new account tool

## Review (Follow-up Execution)
- [x] Root cause fixed: batch creation can now be driven directly from a filled JSON file via `config_path`, removing one remaining manual copy/paste step.
- [x] Root cause fixed: custom audience ID discovery no longer requires manual Ads Manager lookups; `meta_get_custom_audiences` now returns audiences + paging.
- [x] Validation evidence: `pnpm build` passed, `pnpm test` passed (`13` files, `294` tests), lint remains warnings-only for known complexity rules.

## OAuth callback state mismatch troubleshooting
- [x] Identify why callback returns `Invalid or expired state parameter`
- [x] Add callback fallback page that preserves auth completion path using `meta_complete_auth`
- [x] Document recovery flow in README
- [x] Run validation gates (`lint`, `typecheck`, `test`)

## Review
- Root cause confirmed: callback and MCP maintain separate in-memory OAuth `state` stores.
- Callback behavior changed to recover gracefully when state is unknown/expired by surfacing the `code` handoff instead of a hard 400.
- Validation result: typecheck + tests pass; lint reports pre-existing warnings in unrelated files.

## Open Follow-up: durable OAuth state architecture
- [ ] Resolve split-brain OAuth state ownership between callback service and MCP server
- [ ] Implement single source of truth for state (or make callback relay-only)
- [ ] Add integration test for auth start in MCP + callback completion across restarts
- [ ] Update deployment docs and runbook with finalized auth flow
- [ ] Track execution in GitHub issue: https://github.com/DallasCrilleyMarTech/meta-ads-mcp/issues/6

## Open Follow-up: callback service repo boundary
- [x] Create local endpoint app repo snapshot and add submodule at `endpoint-app/`
- [ ] Replace local-only submodule URL with shared remote repository URL
- [ ] Decide whether callback service moves to dedicated repo + submodule
- [ ] Write ADR comparing keep-in-repo vs submodule vs separate repo-only
- [ ] Implement selected option with CI/deploy updates
- [ ] Track execution in GitHub issue: https://github.com/DallasCrilleyMarTech/meta-ads-mcp/issues/13

## Deployment Verification (2026-02-28)
- [x] Verified ownership on `157.180.85.128` (`project=meta-oauth`, `working_dir=/opt/meta-oauth`)
- [x] Created timestamped backups for `/opt/meta-oauth/server.ts` and `/opt/meta-oauth/docker-compose.yml`
- [x] Deployed updated callback service code and restarted `meta-oauth-callback`
- [x] Validated `/health` = `200`, `/auth/start` returns `auth_url` + `state`
- [x] Validated `/callback` without params = `400 Missing code or state parameter`
- [x] Checked container logs for unexpected errors

## P0 Friction Fixes (Issue #7, #8)
- [x] Add pagination cursor inputs (`after`, `before`) to list tools
- [x] Thread cursor inputs through `MetaClient` list methods
- [x] Add `campaign_id` filter support to `meta_get_ads` tool and client
- [x] Add/adjust API client tests for cursor + campaign filtering behavior
- [x] Run validation gates (`lint`, `typecheck`, `test` or `qa`) and capture output

## Review (P0 Friction Fixes)
- [x] Root cause fixed: list tools exposed paging cursors in output but did not accept cursor inputs; `meta_get_ads` had no campaign-level filter path.
- [x] Validation evidence: `qa` passed (`typecheck`, `lint`, `test`) with 5 pre-existing complexity warnings only; tests: `183 passed`.

## P1 Friction Fixes (Issue #9, #10, #11)
- [x] Add `fields` input to non-insights read/list tools
- [x] Thread `fields` through `MetaClient` methods with sane defaults
- [x] Expand `meta_get_ad_details` creative fields inline
- [x] Add `asset_feed_spec` to creatives default field set
- [x] Add/adjust tests for fields override + creative expansion defaults
- [x] Run `qa` and capture results

## Review (P1 Friction Fixes)
- [x] Root cause fixed: non-insights read/list tools lacked field projection, causing oversized payloads; ad details returned only creative ID; creatives omitted `asset_feed_spec` by default.
- [x] Validation evidence: `qa` passed (`typecheck`, `lint`, `test`) with existing complexity warnings only; tests: `193 passed`.

## Fresh-Eyes Review
- [x] Audited modified code paths for subtle bugs and consistency gaps
- [x] Fixed empty `fields` edge case: `fields: []` now falls back to defaults instead of sending `fields=`
- [x] Fixed inconsistent error formatting in `meta_create_campaign` validation path
- [x] Added regression tests for empty-fields fallback behavior
- [x] Re-ran `qa`; all gates passed (warnings unchanged/pre-existing)

## P2 Friction Fix (Issue #12)
- [x] Add size-aware success response management with configurable max bytes
- [x] Summarize oversized payloads and return bounded fallback payload if still oversized
- [x] Add regression tests for oversized JSON/markdown success responses
- [x] Validate with `qa`

## Post-Review Hardening
- [x] Preserve pagination metadata (`paging`, `has_more`, `count`) in summarized oversized responses
- [x] Keep fallback output format aligned with requested response format (`json`/`markdown`) when possible
- [x] Harden `fields` validation (character allowlist + max count)
- [x] Add schema/response tests for new validation and summary behavior
- [x] Fix docs mismatch in README tool count

## Issue #14/#15 Implementation (2026-02-28)
- [x] Update tests to assert slim default creative fields for `meta_get_ad_creatives`
- [x] Update `MetaClient.getAdCreatives` default fields to `id,name,body,thumbnail_url`
- [x] Update tool/README docs to describe the new creative defaults and ad-details field expansion usage
- [x] Run `qa` and capture results

## Review (Issue #14/#15 Implementation)
- [x] Root-cause check: default creative payload reduced by moving `getAdCreatives` default field set from broad expansion to `id,name,body,thumbnail_url`; explicit `fields` override unchanged.
- [x] Validation evidence captured: targeted Vitest slice (`getAdCreatives|getAdDetails`) passed; `qa` passed with existing 5 lint complexity warnings unchanged; full tests `199 passed`.

## Issue #16 Implementation (2026-02-28)
- [x] Add optional `campaign_id` input to `meta_get_ad_creatives`
- [x] Implement campaign-filtered creative retrieval path in `MetaClient.getAdCreatives`
- [x] Deduplicate creatives by `creative.id` when sourced from ads
- [x] Add regression test for campaign-filtered path + paging passthrough
- [x] Run `qa` and capture results

## Review (Issue #16 Implementation)
- [x] Root-cause check: creatives endpoint lacked campaign scoping; added campaign-scoped ads query (`creative{...}`) and deduped creatives server-side.
- [x] Validation evidence captured: targeted Vitest slice (`getAdCreatives`) passed; `qa` passed with existing 5 lint complexity warnings unchanged; full tests `200 passed`.

## Issue #17 Implementation (2026-02-28)
- [x] Extend `response_format` schema to include `compact`
- [x] Add compact serialization path in `createSuccessResponse` (`[headers, ...rows]` for list payloads)
- [x] Preserve paging metadata in compact responses
- [x] Add/adjust schema and response utility tests for compact format
- [x] Run `qa` and capture results

## Review (Issue #17 Implementation)
- [x] Root-cause check: repeated field names in list JSON were token-heavy; compact format now emits header row once and row arrays thereafter.
- [x] Validation evidence captured: targeted Vitest (`tool-responses`, `schemas`) passed; `qa` passed with existing 5 lint complexity warnings unchanged; full tests `204 passed`.

## Issue #19 Implementation (2026-02-28)
- [x] Request `summary=true` on list endpoints to surface `summary.total_count` when available
- [x] Extend pagination metadata to include `total_count` and `page` indicator payload
- [x] Thread summary/limit/cursor context through list tools into `enhancePagination`
- [x] Add regression tests for pagination enrichment and summary-aware list requests
- [x] Run `qa` and capture results

## Review (Issue #19 Implementation)
- [x] Root-cause check: paging cursors were opaque with no scale/progress hints; responses now include `total_count` (when available) and `page` (`current`, `total`) where calculable.
- [x] Validation evidence captured: targeted Vitest for `getAdCreatives` + `enhancePagination` passed; `qa` passed with existing 5 lint complexity warnings unchanged; full tests `206 passed`.

## Issue #18 Implementation (2026-02-28)
- [x] Add `meta_get_campaign_copy` high-level tool
- [x] Implement campaign ads helper in `MetaClient` for `/campaign_id/ads` retrieval with creative fields
- [x] Deduplicate non-empty creative body text and return single-call copy result payload
- [x] Update README campaign tool inventory and server registration test expectations
- [x] Run `qa` and capture results

## Review (Issue #18 Implementation)
- [x] Root-cause check: extracting campaign copy required multi-tool chaining; new `meta_get_campaign_copy` collapses this to one call with deduped `copy_texts`.
- [x] Validation evidence captured: targeted Vitest (`getCampaignAds`, server tool registration) passed; `qa` passed with existing lint complexity warnings unchanged; full tests `207 passed`.

## Composite Tools Batch Execution (2026-02-28)
- [x] Task 1: Scaffold composite tool module + server registration + test scaffold
- [x] Task 2: Implement `meta_get_campaign_summary` + tests
- [x] Task 3: Implement `meta_get_account_overview` + tests
- [x] Task 4: Implement `meta_search_ads` + tests
- [x] Task 5: Implement `meta_validate_campaign_config` + tests
- [x] Task 6: Server registration test + lint gates
- [x] Task 7: Final validation + build + tool count check

## Review (Composite Tools)
- [x] Capture root-cause/value summary and validation evidence after implementation

### Evidence
- Added 4 composite tools in `src/tools/composite.ts` and registered in `src/server.ts`.
- Added regression coverage in `src/__tests__/tools/composite.test.ts` and updated server inventory expectations in `src/__tests__/server.test.ts`.
- Validation: `pnpm typecheck` passed; `pnpm lint` passed with 5 pre-existing complexity warnings; `pnpm test` passed (219 tests); `pnpm build` passed; `pnpm validate:descriptions` reports `Total tools found: 31` and all descriptions valid.

## MCP Audit Fixes (2026-02-28)
- [x] Fix `meta_create_ad_creative` passthrough for `asset_feed_spec`, `url_tags`, `instagram_actor_id`
- [x] Add tests for creative passthrough payload in `MetaClient.createAdCreative`
- [x] Add CBO guardrails for `meta_create_adset` when campaign-level budget is present
- [x] Clarify `meta_create_ad` inline creative docs (`object_story_spec` only)
- [x] Add `stop_time` + budget compatibility validation and docs for campaign tools
- [x] Run verification gates (`typecheck`, `lint`, `test`)

## Review (MCP Audit Fixes)
- [x] Root cause fixed: creative create path now preserves optional dynamic-creative and tracking fields (`asset_feed_spec`, `url_tags`, `instagram_actor_id`, `degrees_of_freedom_spec`, `applink_treatment`) and enforces one-of spec input (`object_story_spec` xor `asset_feed_spec`).
- [x] Root cause fixed: ad-set creation now checks parent campaign budget mode (best-effort) and blocks ad-set budget fields for CBO campaigns with a clear error.
- [x] Root cause fixed: ad creation docstring now explicitly documents inline `object_story_spec` behavior and dynamic creative flow via `meta_create_ad_creative` + `creative_id`.
- [x] Root cause fixed: campaign `stop_time` now validates timezone presence and lifetime-budget compatibility, with docs aligned to real Meta behavior.
- [x] Validation evidence: `qa` passed (`pnpm typecheck`, `pnpm lint`, `pnpm test`), lint emitted existing complexity warnings only; tests `271 passed`.

## Follow-up Fixes: #14 + #16 (2026-03-01)
- [x] Force explicit campaign `bid_strategy` default to `LOWEST_COST_WITHOUT_CAP` when omitted
- [x] Add regression test for campaign bid strategy default behavior
- [x] Add creative CTA guardrail: reject `GET_TICKETS` in `object_story_spec` and suggest `BUY_TICKETS`
- [x] Add creative CTA validator tests
- [x] Re-run verification gates (`typecheck`, `lint`, `test`)

## Review (Follow-up Fixes: #14 + #16)
- [x] Root cause fixed: campaign create requests now always send explicit `bid_strategy`, avoiding Meta fallback to bid-cap defaults that require ad-set `bid_amount`.
- [x] Root cause fixed: `meta_create_ad_creative` now blocks known invalid `GET_TICKETS` CTA in `object_story_spec` before API call and provides replacement guidance.
