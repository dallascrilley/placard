# Meta Ads MCP Server

MCP server for Meta (Facebook/Instagram) Ads management. Enables programmatic creation and management of ad campaigns through Claude Code and other MCP clients.

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `META_APP_ID` | Facebook App ID | Yes |
| `META_APP_SECRET` | Facebook App Secret | Yes |
| `META_API_VERSION` | Graph API version (default: `v22.0`) | No |
| `META_OAUTH_CALLBACK_URL` | OAuth callback URL | Yes |
| `SQLITE_DB_PATH` | Token storage path (default: `./data/tokens.db`) | No |

### 3. Build

```bash
pnpm build
```

### 4. Configure Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "meta-ads-remote": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/meta-ads-mcp/dist/index.js"],
      "env": {
        "META_APP_ID": "your_app_id",
        "META_APP_SECRET": "your_app_secret",
        "META_API_VERSION": "v22.0",
        "META_OAUTH_CALLBACK_URL": "https://your-domain.com/callback",
        "SQLITE_DB_PATH": "/path/to/data/tokens.db"
      }
    }
  }
}
```

## Authentication

### OAuth Flow

The server implements OAuth 2.0 with long-lived token exchange (60 days).

#### Step 1: Get Login Link

```json
{
  "tool": "meta_get_login_link",
  "parameters": { "user_id": "default" }
}
```

Returns a Facebook authorization URL. Open it in a browser and grant permissions.

#### Step 2: Complete Authentication

After authorizing, Facebook redirects to your callback URL with a `code` parameter:

```
https://your-domain.com/callback?code=AQCPd9WAO72OrMnx...&state=abc123
```

Copy the `code` value and complete authentication:

```json
{
  "tool": "meta_complete_auth",
  "parameters": {
    "code": "AQCPd9WAO72OrMnx...",
    "user_id": "default"
  }
}
```

If your callback page shows `Invalid or expired state parameter`, use the same `code` anyway with `meta_complete_auth`. The code can still be valid even when callback-state tracking was lost (for example, after a restart).

#### Step 3: Verify

```json
{
  "tool": "meta_check_auth_status",
  "parameters": { "user_id": "default" }
}
```

### Callback URL Options

The callback URL doesn't need to run any server-side code. You have two options:

#### Option 1: Simple Landing Page (Recommended)

Set up a static page at your callback URL that displays the authorization code:

```html
<!-- https://your-domain.com/callback -->
<html>
<body>
  <h1>Authentication Successful!</h1>
  <p>Copy this code and paste it into Claude:</p>
  <code id="code"></code>
  <script>
    const params = new URLSearchParams(window.location.search);
    document.getElementById('code').textContent = params.get('code');
  </script>
</body>
</html>
```

Then use `meta_complete_auth` with the code.

#### Option 2: Automatic (Requires Server)

If you have a server running at the callback URL, it can automatically exchange the code. See the HTTP transport section.

Important: if your callback server and MCP server do not share the same OAuth state store, callback-side state validation can fail. In that case, recover by extracting `code` from the callback URL and calling `meta_complete_auth`.

### Facebook App Configuration

In [Facebook Developer Console](https://developers.facebook.com/):

1. Go to **Facebook Login > Settings**
2. Add your callback URL to **Valid OAuth Redirect URIs**:
   ```
   https://your-domain.com/callback
   ```
3. Ensure the app has required permissions:
   - `ads_management`
   - `ads_read`
   - `business_management`
   - `pages_read_engagement`
   - `pages_show_list`

### Token Management

- **Long-lived tokens**: 60 days (requires `META_APP_SECRET`)
- **Short-lived tokens**: ~2 hours (without app secret)
- Tokens are persisted in SQLite and survive server restarts
- Use `meta_logout` to revoke a token

## Operations

- Callback deployment and validation runbook:
  - [`docs/runbooks/meta-realnewspr-oauth-callback.md`](docs/runbooks/meta-realnewspr-oauth-callback.md)
- Local endpoint app snapshot is tracked as git submodule at `endpoint-app/`.
  - Current submodule URL is local-only (`/Users/dallascrilley/Code/meta-oauth-endpoint`) and should be replaced with a shared remote URL when the endpoint repo is published.

## Available Tools

### Tool Summary

**Total: 39 tools** across 10 categories

### Authentication (3 tools)

| Tool | Description |
|------|-------------|
| `meta_get_login_link` | Initiate OAuth flow, get authorization URL |
| `meta_check_auth_status` | Verify current authentication status |
| `meta_logout` | Revoke access token |

### Account Management (5 tools)

| Tool | Description |
|------|-------------|
| `meta_get_ad_accounts` | List accessible ad accounts |
| `meta_get_account_info` | Get detailed account information |
| `meta_get_custom_audiences` | List custom audiences for an ad account |
| `meta_create_custom_audience` | Create a custom audience |
| `meta_create_lookalike_audience` | Create a lookalike audience from a source audience |

### Campaigns (6 tools)

| Tool | Description |
|------|-------------|
| `meta_get_campaigns` | List campaigns with filtering |
| `meta_get_campaign_copy` | Get deduplicated ad copy text for a campaign |
| `meta_get_campaign_details` | Get campaign details |
| `meta_create_campaign` | Create new campaign (supports spend_cap, special_ad_category_country, promoted_object) |
| `meta_update_campaign` | Update campaign settings |
| `meta_delete_campaign` | Soft-delete a campaign |

### Ad Sets (5 tools)

| Tool | Description |
|------|-------------|
| `meta_get_adsets` | List ad sets |
| `meta_get_adset_details` | Get ad set details |
| `meta_create_adset` | Create new ad set (supports destination_type, is_dynamic_creative, pacing_type, enhanced validation) |
| `meta_update_adset` | Update ad set settings (supports pacing_type, promoted_object) |
| `meta_delete_adset` | Soft-delete an ad set |

### Ads (5 tools)

| Tool | Description |
|------|-------------|
| `meta_get_ads` | List ads |
| `meta_get_ad_details` | Get ad details |
| `meta_create_ad` | Create new ad |
| `meta_update_ad` | Update ad settings |
| `meta_delete_ad` | Soft-delete an ad |

### Creatives (2 tools)

| Tool | Description |
|------|-------------|
| `meta_get_ad_creatives` | List ad creatives |
| `meta_create_ad_creative` | Create new ad creative |

### Targeting & Insights (6 tools)

| Tool | Description |
|------|-------------|
| `meta_search_targeting` | Search targeting options |
| `meta_get_reach_estimate` | Estimate audience reach |
| `meta_get_account_insights` | Account-level metrics |
| `meta_get_campaign_insights` | Campaign-level metrics |
| `meta_get_adset_insights` | Ad set-level metrics |
| `meta_get_ad_insights` | Ad-level metrics |

### Composite Workflows (6 tools)

| Tool | Description |
|------|-------------|
| `meta_get_campaign_summary` | Get campaign, ad sets, and ads in one call |
| `meta_get_account_overview` | Get account summary with optional insights |
| `meta_search_ads` | Search ad creative text by keyword |
| `meta_validate_campaign_config` | Validate campaign config pre-flight checks |
| `meta_verify_campaign_structure` | Verify live campaign/ad set/ad structure and key fields |
| `meta_generate_budget_phase_plan` | Generate dated `meta_update_campaign` calls for budget phase transitions (optionally execute immediately) |

### Batch Workflows (1 tool)

| Tool | Description |
|------|-------------|
| `meta_create_campaign_from_config` | Create campaign hierarchy (creatives, campaigns, ad sets, ads) from one config payload or `config_path` |

### System (1 tool)

| Tool | Description |
|------|-------------|
| `meta_health_check` | Verify server and API connectivity |

## Important Constraints & Validations

### Advantage+ Audience
- When using Advantage+ audience (`targeting.targeting_automation.advantage_audience = 1` or omitted), `age_max` must be **65**
- For restrictive age targeting (age_max < 65), set `targeting_automation.advantage_audience = 0`

### Geographic Targeting Radius Limits
- **Cities** (`geo_locations.cities`): 10–50 miles (17–80 km)
- **Custom locations** (`geo_locations.custom_locations`): 0.63–50 miles (1–80 km)

### Special Ad Categories
- When using `HOUSING`, `EMPLOYMENT`, `CREDIT`, or `ISSUES_ELECTIONS_POLITICS`, you **must** provide `special_ad_category_country` (array of ISO country codes, e.g., `['US']`)

### Promoted Object Constraints
- `EVENT_RESPONSES` optimization goal does **not** support `promoted_object.event_id`
- The server reports this as a warning (does not block ad-set creation)
- Event linking for Event Response campaigns should go in ad creative `link_data` URL, not the ad set
- For `EVENT_RESPONSES`, set `destination_type` to `ON_EVENT` (batch validation warns when missing/mismatched)

### Campaign Budget Optimization (CBO)
- If a campaign uses CBO (budget set at campaign level), ad sets must **not** have their own `daily_budget` or `lifetime_budget`

### Audience Creation
- `meta_create_custom_audience` and `meta_create_lookalike_audience` delegate to the Meta Marketing API; repeated calls with identical params create duplicates. Check for existing audiences by name before creating if you need idempotent behavior.

## Field Defaults

- `meta_get_ad_creatives` defaults to slim fields: `id,name,body,thumbnail_url`.
- Use the `fields` parameter to request full creative expansion when needed.
- `meta_get_ad_details` supports nested field expansion passthrough (for example: `creative{id,body,title}`).
- List tools support `response_format: "compact"` for token-efficient tabular output (`[headers, ...rows]`).
- `meta_create_campaign_from_config` supports:
  - `config_path` for file-based execution
  - `config_path` is restricted to files under the MCP server process working directory
  - `shared_creatives` (canonical) and backward-compatible `creatives` alias (deprecated)
  - copy-template creative fields (`page_id`, `link`, `event_id`, `message`, `title`, `call_to_action_type`, `image_hash`/`image_key`)
  - `meta_generate_budget_phase_plan` supports `execute_now: true` to apply generated updates immediately

## Documentation

- **[Parameter Reference](docs/PARAMETERS.md)** - Detailed parameter documentation with examples
- **[Batch Workflow](docs/BATCH.md)** - Execution order, rollback hints, dry-run scope, validation semantics
- **[Runbooks](docs/runbooks/)** - Operational guides for deployment and OAuth setup
- **[CHANGELOG](CHANGELOG.md)** - Version history and feature updates

## Development

```bash
# Development with hot reload
pnpm dev

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Run tests
pnpm test
```

## Transport Options

### stdio (Default)

For Claude Code integration:

```bash
pnpm start
```

### HTTP/SSE

For remote clients:

```bash
pnpm start:http  # Listens on PORT (default: 3001)
```

Endpoints:
- `GET /health` - Health check
- `GET /sse` - SSE connection for MCP
- `POST /messages` - MCP message handling

## License

MIT
