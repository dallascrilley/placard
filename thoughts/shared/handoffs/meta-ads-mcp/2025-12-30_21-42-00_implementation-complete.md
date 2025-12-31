---
created: 2025-12-30T21:42:00Z
session_id: meta-ads-mcp-implementation
root_span_id: unknown
---

# Handoff: Meta Ads MCP Server Implementation Complete

## Summary

Built a complete MCP server for Meta (Facebook/Instagram) Ads management. The server provides 22 tools covering authentication, ad account management, campaigns, ad sets, ads, creatives, targeting, and insights. OAuth flow is deployed to Hetzner server with Traefik routing at https://meta.realnewspr.com.

## Current State

### Working
- All 22 MCP tools implemented and typed
- OAuth callback server deployed at https://meta.realnewspr.com/callback
- SQLite-based token storage with expiration handling
- Meta Marketing API v22.0 client with retry logic and error handling
- HTTP/SSE transport for remote usage
- Docker deployment configuration
- Quality gates passing (typecheck, lint, build)

### Not Yet Tested
- End-to-end OAuth flow with real Meta tokens
- Live API calls to Meta Marketing API
- Production deployment of MCP server itself

## Files Changed

### Core Structure
- `package.json` - MCP dependencies, scripts, pnpm config
- `tsconfig.json` - Strict TypeScript configuration
- `biome.json` - Linting/formatting config

### API Layer
- `src/api/meta-client.ts` - Full Meta Marketing API client (580 lines)
- `src/api/auth.ts` - OAuth flow handling
- `src/api/token-store.ts` - SQLite token persistence
- `src/api/error-handling.ts` - Error types and retry logic

### MCP Tools (src/tools/)
- `auth.ts` - get_login_link, check_auth_status, logout
- `accounts.ts` - get_ad_accounts, get_account_info
- `campaigns.ts` - CRUD for campaigns
- `adsets.ts` - CRUD for ad sets
- `ads.ts` - CRUD for ads
- `creatives.ts` - get_ad_creatives, create_ad_creative
- `targeting.ts` - search_targeting, get_reach_estimate
- `insights.ts` - 4 insight tools (account, campaign, adset, ad level)

### Entry Points
- `src/index.ts` - stdio transport (for Claude Code)
- `src/http.ts` - HTTP/SSE transport (for remote)
- `src/server.ts` - MCP server registration

### Deployment
- `Dockerfile` - Node 22 with better-sqlite3 native build
- `docker-compose.yml` - Production deployment config
- `oauth-callback/` - Deployed OAuth callback server (Bun-based)

## Next Steps

1. **Test OAuth Flow**
   - Navigate to https://meta.realnewspr.com/auth/start?user_id=test
   - Complete Facebook login
   - Verify callback stores token

2. **Test MCP Tools**
   - Add to Claude Code config
   - Run `get_ad_accounts` to verify API connectivity
   - Test campaign creation with PAUSED status

3. **Deploy MCP Server (Optional)**
   - Build: `docker build -t meta-ads-mcp .`
   - Run: `docker-compose up -d`
   - Connect via SSE at http://host:3001/sse

4. **Add to Claude Code**
   ```json
   {
     "mcpServers": {
       "meta-ads": {
         "command": "node",
         "args": ["/path/to/meta-ads-mcp/dist/index.js"],
         "env": {
           "META_APP_ID": "2269107970176178",
           "META_APP_SECRET": "...",
           "META_OAUTH_CALLBACK_URL": "https://meta.realnewspr.com/callback"
         }
       }
     }
   }
   ```

## Context

### Key Decisions
- **exactOptionalPropertyTypes**: Using `| undefined` suffix for all optional parameters due to strict TypeScript config
- **SQLite over Postgres**: Simpler deployment, file-based, sufficient for token storage
- **Multi-user support**: Token store keyed by user_id, default is "default"
- **API v22.0**: Using OUTCOME_* objectives (not legacy CONVERSIONS, TRAFFIC, etc.)

### Gotchas
- `better-sqlite3` requires native build - added to pnpm.onlyBuiltDependencies
- Biome's useLiteralKeys conflicts with TypeScript noPropertyAccessFromIndexSignature - disabled rule
- OAuth state expires after 10 minutes - handled in MetaAuth class

### Credentials
- App ID: 2269107970176178
- App Domain: automation.realnewspr.com
- OAuth Callback: https://meta.realnewspr.com/callback
- Server: ubuntu-4gb-rnpr-clients (157.180.85.128)
- DNS: meta.realnewspr.com → 157.180.85.128 (Cloudflare)
