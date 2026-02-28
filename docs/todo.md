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
