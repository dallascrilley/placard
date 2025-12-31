# Plan: Meta Ads MCP Server

## Objective

Build an MCP (Model Context Protocol) server that enables Claude to programmatically create and manage Meta (Facebook/Instagram) advertising campaigns. Users will authenticate via OAuth flow hosted at `meta.realnewspr.com`, granting access to their ad accounts.

**Success Criteria:**
- OAuth flow works at `meta.realnewspr.com` with callback handling
- MCP server exposes tools for campaign/ad set/ad CRUD operations
- Tokens are securely managed with automatic refresh
- Server deployable locally via stdio and remotely via HTTP

## Context

### Credentials (from 1Password)
| Item | Value |
|------|-------|
| App ID | `<REDACTED - see 1Password>` |
| App Secret | `<REDACTED - see 1Password>` |
| Configuration ID | `<REDACTED - see 1Password>` |
| Business ID | `<REDACTED - see 1Password>` |
| Display Name | Real News PR Agent |
| App Domain | `automation.realnewspr.com` |

### Infrastructure
- **OAuth Domain**: `meta.realnewspr.com` (to be created via Cloudflare)
- **OAuth Server**: `ubuntu-4gb-rnpr-clients` (`<REDACTED - see 1Password>`) - lowest utilization
- **Cloudflare Token**: `<REDACTED - see 1Password>`
- **Token Storage**: SQLite file (persistent, no external dependencies)

### Reference Implementation
- `pipeboard-co/meta-ads-mcp` - Python MCP with 29 tools, supports OAuth flow
- Key patterns: `@meta_api_tool` decorator, token caching, HTTP auth middleware

### Meta Marketing API (v22.0)
- **Auth**: OAuth 2.0, System User tokens (never expire) preferred for production
- **Scopes**: `ads_management`, `ads_read`, `business_management`
- **Rate Limits**: Rolling 1-hour window based on call frequency + data volume
- **Objectives** (new): `OUTCOME_AWARENESS`, `OUTCOME_TRAFFIC`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_APP_PROMOTION`

---

## Phases

### Phase 1: Project Scaffolding
**Estimated complexity**: Low

**Changes:**
- `package.json`: Configure as ES module with MCP dependencies
- `tsconfig.json`: Strict TypeScript config
- `src/index.ts`: Entry point with stdio transport
- `src/server.ts`: McpServer instance initialization
- `.env.example`: Document required environment variables

**Structure:**
```
meta-ads-mcp/
  src/
    index.ts              # Entry point
    server.ts             # McpServer setup
    tools/                # Tool implementations
    api/                  # Meta API client
    types/                # TypeScript types
  package.json
  tsconfig.json
  .env.example
```

**Success criteria:**
- [ ] `pnpm build` succeeds
- [ ] `pnpm start` starts MCP server via stdio
- [ ] Server responds to `tools/list` request

---

### Phase 2: OAuth Flow & Token Management
**Estimated complexity**: Medium-High

**Changes:**
- `src/api/auth.ts`: OAuth flow implementation
- `src/api/token-store.ts`: Secure token storage/caching
- `src/tools/auth.ts`: `get_login_link`, `check_auth_status` tools
- Cloudflare: Create `meta.realnewspr.com` DNS record
- Hetzner: Deploy minimal OAuth callback server

**OAuth Flow:**
1. User requests login link via MCP tool
2. Server generates OAuth URL: `https://www.facebook.com/v22.0/dialog/oauth`
3. User authenticates, redirected to `https://meta.realnewspr.com/callback`
4. Callback server exchanges code for access token
5. Token stored securely, available to MCP tools

**Token Types:**
- Short-lived (1-2 hours): Initial OAuth token
- Long-lived (60 days): Exchange with app secret
- System User (never expires): Production recommendation

**Success criteria:**
- [ ] `meta.realnewspr.com` DNS resolves correctly
- [ ] OAuth callback server handles authorization codes
- [ ] Token exchange produces long-lived tokens
- [ ] `get_login_link` tool returns valid OAuth URL
- [ ] `check_auth_status` reports token validity

---

### Phase 3: Core Meta API Client
**Estimated complexity**: Medium

**Changes:**
- `src/api/meta-client.ts`: HTTP client for Meta Marketing API
- `src/api/error-handling.ts`: Structured error types, retry logic
- `src/types/meta-api.ts`: TypeScript interfaces for API responses

**Client Features:**
- Automatic token refresh on 401
- Rate limit handling with exponential backoff
- Request/response logging
- Batch request support

**Key API Endpoints:**
| Resource | Endpoint | Methods |
|----------|----------|---------|
| Ad Account | `/act_{id}` | GET |
| Campaigns | `/act_{id}/campaigns` | GET, POST |
| Ad Sets | `/act_{id}/adsets` | GET, POST |
| Ads | `/act_{id}/ads` | GET, POST |
| Creatives | `/act_{id}/adcreatives` | GET, POST |
| Insights | `/{id}/insights` | GET |

**Success criteria:**
- [ ] Client successfully authenticates with token
- [ ] Rate limit errors handled with backoff
- [ ] Token refresh works automatically
- [ ] All response types properly typed

---

### Phase 4: Account & Campaign Tools
**Estimated complexity**: Medium

**Changes:**
- `src/tools/accounts.ts`: Account management tools
- `src/tools/campaigns.ts`: Campaign CRUD tools

**Tools:**

**Account Tools:**
- `get_ad_accounts`: List accessible ad accounts
- `get_account_info`: Get account details (name, currency, timezone)

**Campaign Tools:**
- `get_campaigns`: List campaigns with filtering
- `get_campaign_details`: Get single campaign
- `create_campaign`: Create new campaign
- `update_campaign`: Update campaign (name, status, budget)

**Campaign Create Schema:**
```typescript
{
  account_id: z.string().regex(/^act_\d+$/),
  name: z.string().min(1),
  objective: z.enum([
    "OUTCOME_AWARENESS",
    "OUTCOME_TRAFFIC",
    "OUTCOME_ENGAGEMENT",
    "OUTCOME_LEADS",
    "OUTCOME_SALES",
    "OUTCOME_APP_PROMOTION"
  ]),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
  special_ad_categories: z.array(z.string()).optional(),
  daily_budget: z.number().optional(), // cents
  lifetime_budget: z.number().optional() // cents
}
```

**Success criteria:**
- [ ] `get_ad_accounts` returns user's ad accounts
- [ ] `create_campaign` creates campaign in PAUSED state
- [ ] `update_campaign` can activate/pause campaigns
- [ ] All tools validate inputs with Zod schemas

---

### Phase 5: Ad Set & Ad Tools
**Estimated complexity**: Medium

**Changes:**
- `src/tools/adsets.ts`: Ad set management
- `src/tools/ads.ts`: Ad management
- `src/tools/creatives.ts`: Creative management

**Ad Set Tools:**
- `get_adsets`: List ad sets (filter by campaign)
- `create_adset`: Create ad set with targeting
- `update_adset`: Update budget, status, targeting

**Ad Set Create Schema:**
```typescript
{
  account_id: z.string(),
  campaign_id: z.string(),
  name: z.string(),
  optimization_goal: z.enum([
    "LINK_CLICKS", "REACH", "CONVERSIONS",
    "APP_INSTALLS", "IMPRESSIONS"
  ]),
  billing_event: z.enum(["IMPRESSIONS", "LINK_CLICKS"]),
  daily_budget: z.number(), // cents
  targeting: z.object({
    age_min: z.number().min(18).max(65).optional(),
    age_max: z.number().min(18).max(65).optional(),
    geo_locations: z.object({
      countries: z.array(z.string()).optional(),
      regions: z.array(z.object({ key: z.string() })).optional(),
      cities: z.array(z.object({
        key: z.string(),
        radius: z.number().optional(),
        distance_unit: z.enum(["mile", "kilometer"]).optional()
      })).optional()
    }),
    custom_audiences: z.array(z.object({ id: z.string() })).optional(),
    targeting_automation: z.object({
      advantage_audience: z.number().optional() // 1 = enabled
    }).optional()
  }),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED")
}
```

**Ad Tools:**
- `get_ads`: List ads (filter by ad set)
- `create_ad`: Create ad with creative
- `update_ad`: Update status

**Creative Tools:**
- `create_ad_creative`: Create creative with image/video
- `get_ad_creatives`: List creatives

**Success criteria:**
- [ ] `create_adset` creates ad set with targeting
- [ ] `create_ad` links ad set to creative
- [ ] Status updates work for ads and ad sets
- [ ] Targeting validation works correctly

---

### Phase 6: Targeting & Insights Tools
**Estimated complexity**: Medium

**Changes:**
- `src/tools/targeting.ts`: Targeting search and reach estimation
- `src/tools/insights.ts`: Performance reporting

**Targeting Tools:**
- `search_targeting`: Search interests, behaviors, demographics
- `get_reach_estimate`: Estimate audience size for targeting spec
- `get_custom_audiences`: List custom audiences
- `get_saved_audiences`: List saved audiences

**Insights Tools:**
- `get_insights`: Performance metrics with breakdowns

**Insights Schema:**
```typescript
{
  object_id: z.string(), // campaign/adset/ad/account ID
  level: z.enum(["account", "campaign", "adset", "ad"]),
  time_range: z.enum([
    "today", "yesterday", "last_7d", "last_14d",
    "last_30d", "last_90d", "maximum"
  ]),
  breakdown: z.enum([
    "age", "gender", "country", "region",
    "platform_position", "device_platform"
  ]).optional(),
  action_attribution_windows: z.array(
    z.enum(["1d_click", "1d_view", "7d_click", "7d_view"])
  ).optional()
}
```

**Success criteria:**
- [ ] `search_targeting` finds interests by query
- [ ] `get_reach_estimate` returns audience size
- [ ] `get_insights` returns metrics with breakdowns
- [ ] Attribution windows work correctly

---

### Phase 7: HTTP Transport & Deployment
**Estimated complexity**: Medium

**Changes:**
- `src/transports/http.ts`: HTTP/SSE transport setup
- `src/middleware/auth.ts`: HTTP authentication middleware
- `Dockerfile`: Container build
- `docker-compose.yml`: Local development
- Deploy to Hetzner alongside OAuth callback

**HTTP Auth:**
- `Authorization: Bearer <token>` header support
- `X-META-ACCESS-TOKEN` header support
- Session management for multi-user

**Deployment:**
- MCP server runs on same Hetzner server as OAuth
- Reverse proxy via Cloudflare (optional)
- Environment variables via 1Password secrets

**Success criteria:**
- [ ] HTTP transport works with Claude Code
- [ ] Multi-user token isolation works
- [ ] Container builds and runs correctly
- [ ] Deployed and accessible remotely

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Meta API rate limits | High | Implement exponential backoff, batch operations |
| Token expiration mid-session | Medium | Automatic refresh, graceful error handling |
| OAuth callback security | High | HTTPS only, state parameter validation, PKCE |
| API version deprecation | Medium | Pin to v22.0, monitor deprecation notices |

---

## Open Questions

1. ~~**RESOLVED**: Multi-account support - users can select from accessible accounts~~
2. ~~**RESOLVED**: SQLite file for token storage~~
3. ~~**RESOLVED**: `ubuntu-4gb-rnpr-clients` server for OAuth flow~~
4. ~~**RESOLVED**: No Instagram-specific placements initially - use default/automatic placements~~

---

## Dependencies

**NPM Packages:**
```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",
  "zod": "^3.25.0",
  "typescript": "^5.x"
}
```

**Infrastructure:**
- Cloudflare DNS for `meta.realnewspr.com`
- Hetzner server for OAuth callback
- 1Password for credential management

---

## Success Metrics

- [ ] OAuth flow completes end-to-end
- [ ] User can create a campaign through MCP
- [ ] User can view ad performance insights
- [ ] Server handles token refresh transparently
- [ ] Documented setup instructions work for new users
