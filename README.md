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
  - [`docs/runbooks/example.com`](docs/runbooks/example.com)
- Local endpoint app snapshot is tracked as git submodule at `endpoint-app/`.
  - Current submodule URL is local-only (`/Users/dallascrilley/Code/meta-oauth-endpoint`) and should be replaced with a shared remote URL when the endpoint repo is published.

## Available Tools

### Authentication (4 tools)

| Tool | Description |
|------|-------------|
| `meta_get_login_link` | Initiate OAuth flow, get authorization URL |
| `meta_complete_auth` | Exchange authorization code for access token |
| `meta_check_auth_status` | Verify current authentication status |
| `meta_logout` | Revoke access token |

### Account Management (2 tools)

| Tool | Description |
|------|-------------|
| `meta_get_ad_accounts` | List accessible ad accounts |
| `meta_get_account_info` | Get detailed account information |

### Campaigns (4 tools)

| Tool | Description |
|------|-------------|
| `meta_get_campaigns` | List campaigns with filtering |
| `meta_get_campaign_details` | Get campaign details |
| `meta_create_campaign` | Create new campaign |
| `meta_update_campaign` | Update campaign settings |

### Ad Sets (4 tools)

| Tool | Description |
|------|-------------|
| `meta_get_adsets` | List ad sets |
| `meta_get_adset_details` | Get ad set details |
| `meta_create_adset` | Create new ad set |
| `meta_update_adset` | Update ad set settings |

### Ads (4 tools)

| Tool | Description |
|------|-------------|
| `meta_get_ads` | List ads |
| `meta_get_ad_details` | Get ad details |
| `meta_create_ad` | Create new ad |
| `meta_update_ad` | Update ad settings |

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

### System (1 tool)

| Tool | Description |
|------|-------------|
| `meta_health_check` | Verify server and API connectivity |

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
