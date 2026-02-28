---
title: "OAuth callback state mismatch recovery"
summary: "Resolved `Invalid or expired state parameter` during Meta OAuth callback by adding a callback recovery handoff to `meta_complete_auth`, documenting the operator flow, and validating live deployment on meta.realnewspr.com."
status: "solved_with_followups"
date: "2026-02-28"
category: "integration-issues"
tags:
  - oauth
  - callback
  - state-management
  - deployment
  - mcp
related_issues:
  - "https://github.com/DallasCrilleyMarTech/meta-ads-mcp/issues/6"
  - "https://github.com/DallasCrilleyMarTech/meta-ads-mcp/issues/13"
related_commits:
  - "bee84c7"
services:
  - "Meta Ads MCP server"
  - "meta-oauth-callback container"
  - "coolify-proxy (Traefik)"
  - "meta.realnewspr.com"
environment:
  - "Local repo: /Users/dallascrilley/Code/meta-ads-mcp"
  - "Prod callback host: root@157.180.85.128 (/opt/meta-oauth)"
---

## Symptom

- Users completed Meta auth but callback returned `Invalid or expired state parameter`.
- Callback endpoint behavior blocked auto-completion when callback-side state was unknown.

## Investigation

### What was observed

- `meta.realnewspr.com/callback` was live behind Cloudflare and served by the Hetzner host (`157.180.85.128`).
- Callback service (`/opt/meta-oauth/server.ts`) and MCP auth layer (`src/api/auth.ts`) both had independent in-memory OAuth `state` stores.
- Restart/process boundary differences caused callback-side `state` misses despite a still-valid auth `code`.

### Why previous behavior failed

- Callback hard-failed on missing/expired `state` (`400`) before providing an auth completion recovery path.
- This made valid `code` values harder to use in the documented manual flow.

## Root Cause

Split-brain state ownership across two services:

- MCP generated auth links and tracked `state` in one in-memory map.
- Callback validated `state` against a separate in-memory map.

When those stores diverged (restart, different process origin, or path mismatch), callback rejected the request even if `code` was still exchangeable.

## Working Solution

### Code changes

1. Updated callback invalid/expired state handling to return a recovery HTML page instead of hard-failing.
2. Recovery page includes a ready-to-run `meta_complete_auth` payload using the returned `code`.
3. Added optional `MCP_SERVER_URL` hint in callback page for faster operator recovery.
4. Documented this fallback explicitly in README.

Primary files:

- [server.ts](/Users/dallascrilley/Code/meta-ads-mcp/oauth-callback/server.ts)
- [README.md](/Users/dallascrilley/Code/meta-ads-mcp/README.md)
- [todo.md](/Users/dallascrilley/Code/meta-ads-mcp/docs/todo.md)

## Deployment + Verification Evidence

Live deployment and checks on `2026-02-28`:

- Host/container ownership verified:
  - `meta-oauth-callback` at `/opt/meta-oauth`
  - Traefik route `Host(\`meta.realnewspr.com\`)`
- Timestamped backups created before edits:
  - `/opt/meta-oauth/server.ts.bak.20260228-200736`
  - `/opt/meta-oauth/docker-compose.yml.bak.20260228-200736`
- Rebuild/restart executed with Docker Compose.

Post-change validation:

- `GET /health` => `200` JSON
- `GET /auth/start` => returns `auth_url` + `state`
- `GET /callback` (no params) => `400 Missing code or state parameter`
- Container logs showed normal startup, no unexpected runtime errors

Operational runbook:

- [meta-realnewspr-oauth-callback.md](/Users/dallascrilley/Code/meta-ads-mcp/docs/runbooks/meta-realnewspr-oauth-callback.md)

## Prevention Strategy

### Architecture

- Choose one OAuth state authority (recommended: MCP owns state, callback is relay-only).
- If callback must validate state, move to shared durable store with atomic consume semantics.
- Remove ambiguous dual start paths in production (`/auth/start` ownership must be explicit).

### Release/Drift controls

- Keep one deployable callback source of truth.
- Add deploy metadata in health response (`git_sha`, contract version).
- Add CI/CD check to verify deployed SHA/config match intended release.

### Monitoring

- Track and alert on:
  - `oauth_callback_state_miss_total`
  - `oauth_complete_auth_direct_total`
  - token exchange failures

### Tests to add

- Integration:
  - MCP auth start + callback completion across restarts
  - duplicate callback submissions
  - concurrent user auth flows
- E2E:
  - stale state + valid code recovery path remains functional

## Related Documentation

- [agent-friction-report.md](/Users/dallascrilley/Code/meta-ads-mcp/docs/agent-friction-report.md)
- [todo.md](/Users/dallascrilley/Code/meta-ads-mcp/docs/todo.md)
- [meta-realnewspr-oauth-callback.md](/Users/dallascrilley/Code/meta-ads-mcp/docs/runbooks/meta-realnewspr-oauth-callback.md)
- [.gitmodules](/Users/dallascrilley/Code/meta-ads-mcp/.gitmodules)

## Follow-up Status

- Durable OAuth state architecture fix: tracked in #6.
- Callback repo/submodule boundary decision: tracked in #13.
