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
