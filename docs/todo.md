# TODO

## Review Fixes: Duplicate + Overview Follow-ups (2026-03-01)
- [x] Normalize `pacing_type` in `meta_duplicate_adset` to first valid string from array/string sources
- [x] Add unique fallback creative naming in `meta_duplicate_ad` to reduce duplicate destination creative names
- [x] Add `account_id` to default campaign compare ignore fields for consistency with entity compare behavior
- [x] Add regression tests for duplicate-adset pacing normalization and duplicate-ad fallback creative naming
- [x] Add explicit test assertion that campaign list calls include `summary=true`
- [x] Run verification commands (`pnpm test`, `pnpm typecheck`, `pnpm validate:descriptions`)

## Review (Duplicate + Overview Follow-ups)
- Root-cause/value: review notes highlighted potential type mismatch risk for `pacing_type` arrays and repetitive fallback creative names during cross-account duplication. Updated normalization and naming paths to make inputs robust and creative names less collision-prone, and tightened test coverage around summary/pacing behavior.
- Validation evidence:
  - `pnpm test` passed (`13/13` files, `251/251` tests)
  - `pnpm typecheck` passed
  - `pnpm validate:descriptions` passed (`Total tools found: 40`)

## Duplicate + Compare Tools (2026-03-01)
- [x] Add shared entity comparison utility for normalized nested diffs
- [x] Add campaign duplicate/compare tools
- [x] Add ad set duplicate/compare tools
- [x] Add ad duplicate/compare tools
- [x] Fix `MetaClient.updateAdSet` typing/body support for `promoted_object`
- [x] Add comparison utility tests and update server tool inventory expectations
- [x] Update README tool inventory for new tools
- [x] Run validation gates (`typecheck`, `lint`, `test`, `validate:descriptions`)

## Review (Duplicate + Compare Tools)
- Root-cause/value: There was no direct way to clone reference entities or run deterministic field-level comparisons between reference entities and MCP/agent-created entities. Added dedicated duplicate + compare tools for campaigns, ad sets, and ads, backed by a shared compare utility.
- Verification evidence:
  - `pnpm typecheck` passed
  - `pnpm lint` passed (6 pre-existing complexity warnings)
  - `pnpm test` passed (`11/11` files, `243/243` tests)
  - `pnpm validate:descriptions` passed (`Total tools found: 39`)

## Campaign Tree Compare Composite Tool (2026-03-01)
- [x] Add `meta_compare_campaign_trees` composite tool for campaign + ad sets + ads
- [x] Include optional `ignore_fields` and `include_matches` controls
- [x] Update composite/server registration expectations
- [x] Update README composite tool inventory
- [x] Add handler-level regression test for `meta_compare_campaign_trees`
- [x] Re-run validation gates and capture updated evidence

## Review (Campaign Tree Compare Composite Tool)
- Root-cause/value: The existing entity-level compare tools required multiple calls to assess full campaign parity. Added `meta_compare_campaign_trees` to compare campaign + ad set + ad layers in one call, including missing-entity detection and per-layer diff summaries.
- Validation evidence:
  - `pnpm typecheck` passed
  - `pnpm lint` passed (6 pre-existing complexity warnings)
  - `pnpm test` passed (`11/11` files, `244/244` tests)
  - `pnpm validate:descriptions` passed (`Total tools found: 40`)

## Review Fixes: Campaign Tree Compare (2026-03-01)
- [x] Fix pagination truncation in `meta_compare_campaign_trees` by fetching all ad set/ad pages
- [x] Replace duplicate-name pairing logic with structural similarity pairing (instead of name + sorted-id index)
- [x] Add regression test for paged traversal behavior
- [x] Add regression test for duplicate-name pairing correctness
- [x] Re-run validation gates and capture evidence

## Review (Campaign Tree Compare Fixes)
- Root-cause/value: compare-tree could return incorrect results by truncating at first page and arbitrarily pairing duplicate-named entities by ID ordering. Updated to fully page through children and pair entities by structural similarity scoring with stable signature hints.
- Validation evidence:
  - `pnpm typecheck` passed
  - `pnpm lint` passed (7 pre-existing complexity warnings)
  - `pnpm test` passed (`12/12` files, `249/249` tests)
  - `pnpm validate:descriptions` passed (`Total tools found: 40`)

## Review Fixes: Hierarchy + Cross-Account Creative Clone (2026-03-01)
- [x] Preserve ad hierarchy by comparing ads within paired ad-set contexts (not global campaign pool)
- [x] Keep ad compare semantics ID-agnostic while still enforcing tree structure
- [x] Change `meta_duplicate_ad` to clone source creative into destination account before creating duplicated ad
- [x] Add regression test for moved-ads-between-adsets scenario
- [x] Add regression tests for ad duplicate creative cloning + non-cloneable creative failure
- [x] Re-run validation gates and capture evidence

## Review (Hierarchy + Cross-Account Creative Clone Fixes)
- Root-cause/value: tree compare could report false matches when ads were attached to different ad sets, and ad duplication reused source creative IDs that can fail across accounts. Updated tree compare to enforce parent-child context and duplicate-ad to create destination-owned creative IDs.
- Validation evidence:
  - `pnpm typecheck` passed
  - `pnpm lint` passed (7 pre-existing complexity warnings)
  - `pnpm test` passed (`12/12` files, `249/249` tests)
  - `pnpm validate:descriptions` passed (`Total tools found: 40`)

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
