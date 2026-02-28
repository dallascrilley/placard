# meta.realnewspr.com OAuth Callback Runbook

## Scope
- Domain: `meta.realnewspr.com`
- Host: `root@157.180.85.128` (`ubuntu-4gb-rnpr-clients`)
- App container: `meta-oauth-callback`
- Deploy path: `/opt/meta-oauth`
- Compose file: `/opt/meta-oauth/docker-compose.yml`
- Callback app file: `/opt/meta-oauth/server.ts`
- Reverse proxy: Traefik container `coolify-proxy`
- Traefik host rule: `Host(\`meta.realnewspr.com\`)`

## Ownership Verification
```bash
ssh root@157.180.85.128
hostname
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' \
  | grep -E 'meta-oauth-callback|coolify-proxy'
docker inspect meta-oauth-callback --format \
  'project={{index .Config.Labels "com.docker.compose.project"}} working_dir={{index .Config.Labels "com.docker.compose.project.working_dir"}}'
```

Expected:
- Hostname = `ubuntu-4gb-rnpr-clients`
- `meta-oauth-callback` and `coolify-proxy` are running
- Compose project = `meta-oauth`
- Working dir = `/opt/meta-oauth`

## Safe Deploy Procedure
1. Backup before edits:
```bash
ssh root@157.180.85.128 '
  set -euo pipefail
  ts=$(date +%Y%m%d-%H%M%S)
  cp /opt/meta-oauth/server.ts /opt/meta-oauth/server.ts.bak.$ts
  cp /opt/meta-oauth/docker-compose.yml /opt/meta-oauth/docker-compose.yml.bak.$ts
  echo "backup_timestamp=$ts"
'
```

2. Sync updated callback app:
```bash
scp oauth-callback/server.ts root@157.180.85.128:/opt/meta-oauth/server.ts
```

3. Rebuild and restart:
```bash
ssh root@157.180.85.128 '
  set -euo pipefail
  cd /opt/meta-oauth
  docker compose build --no-cache meta-oauth
  docker compose up -d meta-oauth
  docker ps --filter name=meta-oauth-callback --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
'
```

## Post-Deploy Validation
```bash
ssh root@157.180.85.128 'curl -si https://meta.realnewspr.com/health'
ssh root@157.180.85.128 'curl -s https://meta.realnewspr.com/auth/start | jq .'
ssh root@157.180.85.128 'curl -si https://meta.realnewspr.com/callback | head -20'
ssh root@157.180.85.128 'docker logs --since 10m meta-oauth-callback | tail -200'
```

Success criteria:
- `/health` returns `200` JSON
- `/auth/start` returns `auth_url` and `state`
- `/callback` without query params returns `400` with `Missing code or state parameter`
- No unexpected errors in `meta-oauth-callback` logs

## Security Notes
- Do not print secrets to terminal or commit secret values.
- `META_APP_SECRET` must be injected at runtime from secret-managed storage.
- Rotation follow-up is tracked in the repo TODO and GitHub issue list.

## Current Known Risk
- Callback and MCP currently maintain separate in-memory OAuth `state` stores.
- User recovery exists via `meta_complete_auth`, but long-term fix should move to a single shared state owner/store.

## Submodule Candidate
The callback service at `/opt/meta-oauth` is now a distinct deployable unit. A dedicated repository and git submodule can reduce drift between:
- local `oauth-callback/`
- deployed `/opt/meta-oauth`

Minimum acceptance before migration:
- clear repo boundary (callback-only code + compose files)
- independent CI build/test for callback service
- deploy runbook moved with service source
