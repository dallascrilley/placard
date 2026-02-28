# TODO

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
