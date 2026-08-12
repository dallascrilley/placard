# Placard

**MCP server that gives coding agents tools to build and manage Meta ad campaigns.**

[![CI](https://github.com/dallascrilley/placard/actions/workflows/ci.yml/badge.svg)](https://github.com/dallascrilley/placard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](.nvmrc)

Meta's Marketing API is large, stateful, and unforgiving about field
combinations. Placard wraps it in 49 MCP tools so an agent in Claude Code (or
any MCP client) can go from "build me a campaign" to a live campaign tree
without you clicking through Ads Manager.

## Provenance

Placard is original work in this repository: the MCP server, Meta Marketing API
client, OAuth + SQLite token store, Zod tool schemas, pre-flight Meta rule
checks, and the hermetic test harness. It depends on the public
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
and Meta's HTTP API; it is not a fork of another Meta MCP server or Ads Manager
wrapper.

**What CI proves** (no Meta credentials): typecheck, lint, unit tests against a
fetch mock, build, tool-description validation, and
`scripts/smoke-test.mjs` (server starts and exposes 49 tools). **What is
self-reported:** end-to-end creates against a real ad account — that path needs
your Meta app and token, so a cold clone and CI cannot exercise spend-capable
writes.

## What it looks like

Once Placard is wired into your client, the whole surface is conversational:

```
> Create a $50/day traffic campaign for our spring promo, US only, ages 25-54.

  meta_validate_campaign_config  ->  ok, 0 errors, 1 warning
  meta_create_campaign           ->  campaign 120200000000000000 (PAUSED)
  meta_create_adset              ->  ad set 120200000000000001, daily_budget 5000
  meta_create_ad                 ->  ad 120200000000000002

  Created and left paused. The warning: age_max 54 with Advantage+ audience
  enabled, so I set targeting_automation.advantage_audience = 0.
```

Every tool returns structured JSON, and the error paths return the full Meta
error object (code, subcode, `error_user_msg`) instead of a flattened string,
because that detail is what lets an agent correct itself on the next call. See
[`src/api/error-handling.ts`](src/api/error-handling.ts).

## Requirements

- Node 22 or newer. Development is pinned to the version in
  [`.nvmrc`](.nvmrc); CI runs 22, 24, and 26.
- pnpm (the repo pins a version via `packageManager`).
- `better-sqlite3` ships prebuilt binaries for common platforms (macOS
  arm64/x64, Linux x64/arm64, Windows), so most installs compile nothing. On
  an unlisted platform you need a C++ toolchain (Xcode Command Line Tools on
  macOS, `build-essential` and `python3` on Debian/Ubuntu).
- A Meta app with the Marketing API enabled, for anything that touches real
  ad accounts.

## Install

Placard is not published to npm (`"private": true` in package.json). Clone and build it:

```bash
git clone https://github.com/dallascrilley/placard.git
cd placard
pnpm install
pnpm build
```

Verify the build without any Meta credentials at all:

```bash
node scripts/smoke-test.mjs
# smoke test OK: "placard" started with no credentials and exposed 49 tools
```

## Wire it into your client

### Claude Code

```bash
claude mcp add placard \
  --env META_APP_ID=000000000000000 \
  --env META_APP_SECRET=your_app_secret \
  --env META_OAUTH_CALLBACK_URL=https://example.com/callback \
  --env SQLITE_DB_PATH=/absolute/path/to/data/tokens.db \
  -- node /absolute/path/to/placard/dist/index.js
```

### Claude Desktop

Add this to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/` on macOS,
`%APPDATA%\Claude\` on Windows):

```json
{
  "mcpServers": {
    "placard": {
      "command": "node",
      "args": ["/absolute/path/to/placard/dist/index.js"],
      "env": {
        "META_APP_ID": "000000000000000",
        "META_APP_SECRET": "your_app_secret",
        "META_API_VERSION": "v22.0",
        "META_OAUTH_CALLBACK_URL": "https://example.com/callback",
        "SQLITE_DB_PATH": "/absolute/path/to/data/tokens.db"
      }
    }
  }
}
```

The credential values above are placeholders. Replace them with your own app's
values from the Meta App Dashboard. `.env.example` documents every variable
Placard reads, including the optional rate-limit knobs.

## What needs real Meta credentials

I want this boundary to be obvious before you invest an afternoon in it.

**Works with no credentials at all:**

- Installing, building, typechecking, linting.
- The full test suite. Every test runs against the fetch mock in
  [`src/__tests__/utils/mock-fetch.ts`](src/__tests__/utils/mock-fetch.ts), so
  no test opens a socket or needs a token.
- Starting the server, connecting a client, and listing all 49 tools. This is
  what `scripts/smoke-test.mjs` proves on every CI run.
- `meta_health_check`, which reports server status and version only.
- `meta_check_auth_status`, which reports that you are not authenticated yet.

**Needs a Meta app (`META_APP_ID` and `META_APP_SECRET`):**

- The OAuth flow: `meta_get_login_link`, then `meta_complete_auth`.
- Long-lived (60 day) tokens. Without the app secret you only get short-lived
  (~2 hour) ones.

**Needs an authenticated token plus an ad account:**

- Every remaining tool, including the validation and comparison ones.
  `meta_validate_campaign_config` sounds local but resolves targeting interest
  IDs and pulls a reach estimate, so it calls the API too.

## Authentication

Placard implements OAuth 2.0 with long-lived token exchange. Tokens persist in
SQLite at `SQLITE_DB_PATH` and survive restarts.

1. Call `meta_get_login_link`. It returns a Facebook authorization URL.
2. Open it, grant permissions. Meta redirects to your callback URL with a
   `code` query parameter.
3. Call `meta_complete_auth` with that `code`.
4. Call `meta_check_auth_status` to confirm.

If your callback page reports `Invalid or expired state parameter`, use the
same `code` with `meta_complete_auth` anyway. The code is often still valid
when only the callback-side state tracking was lost, for example after a
restart.

### The callback URL

It does not need to run server-side code. A static page that reads `code` out
of the query string and shows it to you is enough:

```html
<script>
  const params = new URLSearchParams(window.location.search);
  document.getElementById("code").textContent = params.get("code");
</script>
```

If you would rather automate the exchange, [`oauth-callback/`](oauth-callback/)
holds a minimal Node callback server with a Dockerfile and compose file. It is
a reference implementation, not a hosted service, and you deploy it yourself.

In the Meta App Dashboard, add your callback URL under **Facebook Login >
Settings > Valid OAuth Redirect URIs**, and make sure the app requests
`ads_management`, `ads_read`, `business_management`, `pages_read_engagement`,
and `pages_show_list`.

## Tools

49 tools. The count is asserted by
[`scripts/smoke-test.mjs`](scripts/smoke-test.mjs) on every CI run, so this
number cannot drift from the server.

| Group | Count | Tools |
|---|---|---|
| Authentication | 4 | `meta_get_login_link`, `meta_complete_auth`, `meta_check_auth_status`, `meta_logout` |
| Accounts and audiences | 5 | `meta_get_ad_accounts`, `meta_get_account_info`, `meta_get_custom_audiences`, `meta_create_custom_audience`, `meta_create_lookalike_audience` |
| Campaigns | 8 | `meta_get_campaigns`, `meta_get_campaign_details`, `meta_get_campaign_copy`, `meta_create_campaign`, `meta_update_campaign`, `meta_delete_campaign`, `meta_duplicate_campaign`, `meta_compare_campaigns` |
| Ad sets | 7 | `meta_get_adsets`, `meta_get_adset_details`, `meta_create_adset`, `meta_update_adset`, `meta_delete_adset`, `meta_duplicate_adset`, `meta_compare_adsets` |
| Ads | 7 | `meta_get_ads`, `meta_get_ad_details`, `meta_create_ad`, `meta_update_ad`, `meta_delete_ad`, `meta_duplicate_ad`, `meta_compare_ads` |
| Creatives | 2 | `meta_get_ad_creatives`, `meta_create_ad_creative` |
| Ad images | 1 | `meta_upload_image` |
| Targeting | 2 | `meta_search_targeting`, `meta_get_reach_estimate` |
| Insights | 4 | `meta_get_account_insights`, `meta_get_campaign_insights`, `meta_get_adset_insights`, `meta_get_ad_insights` |
| Composite workflows | 7 | `meta_get_campaign_summary`, `meta_get_account_overview`, `meta_search_ads`, `meta_validate_campaign_config`, `meta_compare_campaign_trees`, `meta_verify_campaign_structure`, `meta_generate_budget_phase_plan` |
| Batch | 1 | `meta_create_campaign_from_config` |
| System | 1 | `meta_health_check` |

Every tool carries MCP annotations (read-only, destructive, idempotent) from
[`src/constants/annotations.ts`](src/constants/annotations.ts) so a client can
tell a listing call apart from a delete. `pnpm validate:descriptions` enforces
that every description is long enough to actually specify arguments, return
shape, errors, and an example, which is what an agent needs to call a tool
correctly on the first try.

## Constraints Placard knows about

These are Meta rules that are easy to violate and produce unhelpful API
errors. Placard checks them before the request goes out, in
[`src/tools/adsets.ts`](src/tools/adsets.ts),
[`src/tools/campaigns.ts`](src/tools/campaigns.ts), and
[`src/tools/batch.ts`](src/tools/batch.ts).

- **Advantage+ audience.** With `targeting_automation.advantage_audience` set
  to `1` or omitted, `age_max` must be `65`. For narrower age targeting, set it
  to `0`.
- **Geographic radius.** Cities accept 10 to 50 miles. Custom locations accept
  0.63 to 50 miles.
- **Special ad categories.** `HOUSING`, `EMPLOYMENT`, `CREDIT`, and
  `ISSUES_ELECTIONS_POLITICS` all require `special_ad_category_country`.
- **Promoted objects.** The `EVENT_RESPONSES` optimization goal does not
  support `promoted_object.event_id`. Placard warns rather than blocking, and
  expects `destination_type: ON_EVENT`.
- **Campaign budget optimization.** When budget is set at the campaign level,
  ad sets must not carry their own `daily_budget` or `lifetime_budget`.

Token efficiency matters when an agent is paying for every response, so list
tools accept `response_format: "compact"` for tabular output, and
`meta_get_ad_creatives` defaults to slim fields (`id,name,body,thumbnail_url`)
rather than full creative expansion.

## Non-goals

- **Not published to npm.** `package.json` is `"private": true` on purpose
  (source install only). Clone and build. I will publish when the API surface
  stops moving.
- **No reporting or analytics layer.** The insights tools return what Meta
  returns. Placard does not model attribution, blend channels, or store
  history.
- **No authentication on the HTTP transport.** `pnpm start:http` is for local
  development. It has no auth layer, so do not expose it publicly. stdio is the
  intended deployment.
- **No multi-tenant story.** Tokens are keyed by a `user_id` string in a local
  SQLite file with no encryption at rest (see [SECURITY.md](SECURITY.md)). That
  is enough for one operator on a locked-down machine, not for a hosted service.
- **No idempotency guarantees.** Calling `meta_create_custom_audience` twice
  with the same arguments creates two audiences. Check by name first if you
  need it to be idempotent.
- **Meta only.** No Google Ads, no TikTok, no LinkedIn.
- **Pre-1.0.** Tool names and argument shapes can still change.

## Development

```bash
pnpm dev        # stdio server with hot reload
pnpm validate   # typecheck, lint, test, build, description check, smoke test
```

`pnpm validate` is exactly what CI runs. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full command table and the rules for
adding a tool.

### Transports

```bash
pnpm start        # stdio (default, and what MCP clients use)
pnpm start:http   # HTTP/SSE on PORT, default 3001
```

The HTTP server exposes `GET /health`, `GET /sse`, and `POST /messages`.

## Documentation

- [Parameter reference](docs/PARAMETERS.md), detailed parameters with examples
- [Batch workflow](docs/BATCH.md), execution order, rollback hints, dry-run
  scope, validation semantics
- [Migration guide](docs/MIGRATION.md), what changed between versions
- [CHANGELOG](CHANGELOG.md)
- [SECURITY.md](SECURITY.md), how tokens are stored and how to report an issue

## License

MIT. See [LICENSE](LICENSE).
