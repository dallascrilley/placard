import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HEALTH_CHECK_ANNOTATIONS } from "./constants/index.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerAdTools } from "./tools/ads.js";
import { registerAdSetTools } from "./tools/adsets.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerCreativeTools } from "./tools/creatives.js";
import { registerInsightsTools } from "./tools/insights.js";
import { registerTargetingTools } from "./tools/targeting.js";

const SERVER_NAME = "meta-ads-mcp";
const SERVER_VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register a health check tool for initial testing
  server.tool(
    "meta_health_check",
    `Check if the Meta Ads MCP server is running and healthy.

Performs a basic health check to verify the server is operational and responding to requests. Returns server status, name, version, and current timestamp. Use this to verify connectivity before performing other operations.

Args:
  (No parameters required)

Returns:
  {
    "status": "healthy",
    "server": "meta-ads-mcp",
    "version": "0.1.0",
    "timestamp": "2025-01-01T00:00:00.000Z"
  }

Examples:
  - Basic health check: {}

Errors:
  - If the server is unhealthy or unreachable, the MCP connection will fail before reaching this tool.`,
    {
      // No parameters needed
    },
    HEALTH_CHECK_ANNOTATIONS,
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "healthy",
                server: SERVER_NAME,
                version: SERVER_VERSION,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Auth tools (get_login_link, check_auth_status, logout)
  registerAuthTools(server);

  // Account tools (get_ad_accounts, get_account_info)
  registerAccountTools(server);

  // Campaign tools (get_campaigns, get_campaign_details, create_campaign, update_campaign)
  registerCampaignTools(server);

  // Ad Set tools (get_adsets, get_adset_details, create_adset, update_adset)
  registerAdSetTools(server);

  // Ad tools (get_ads, get_ad_details, create_ad, update_ad)
  registerAdTools(server);

  // Creative tools (get_ad_creatives, create_ad_creative)
  registerCreativeTools(server);

  // Targeting tools (search_targeting, get_reach_estimate)
  registerTargetingTools(server);

  // Insights tools (get_account_insights, get_campaign_insights, get_adset_insights, get_ad_insights)
  registerInsightsTools(server);

  return server;
}
