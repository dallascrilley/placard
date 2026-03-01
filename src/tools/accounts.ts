/**
 * Ad Account Tools
 *
 * MCP tools for managing Meta ad accounts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CREATE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
} from "../constants/index.js";
import {
  accountIdSchema,
  createLimitSchema,
  fieldsSchema,
  paginationCursorSchema,
  responseFormatSchema,
  userIdSchema,
} from "../schemas/index.js";
import { normalizeAccountId } from "../utils/id-normalizer.js";
import { withToolHandler } from "../utils/tool-handler.js";
import {
  createSuccessResponse,
  enhancePagination,
} from "../utils/tool-responses.js";

export function registerAccountTools(server: McpServer): void {
  /**
   * List all ad accounts accessible by the authenticated user
   */
  server.tool(
    "meta_get_ad_accounts",
    `List all ad accounts accessible by the authenticated user.

Retrieves all Meta ad accounts that the authenticated user has access to, with pagination support. Useful for discovering available ad accounts before performing operations.

Args:
  - limit (number, optional): Maximum number of accounts to return, 1-100 (default: 25)
  - fields (array[string], optional): Specific account fields to return
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "accounts": [
      {
        "id": "act_123456789",
        "account_id": "123456789",
        "name": "My Ad Account",
        "account_status": 1,
        "currency": "USD",
        "timezone_name": "America/New_York"
      }
    ],
    "paging": {
      "cursors": {
        "before": "...",
        "after": "..."
      },
      "next": "https://graph.facebook.com/v22.0/me/adaccounts?..."
    }
  }

Examples:
  - Get first 25 accounts: { "limit": 25 }
  - Get more accounts: { "limit": 100 }
  - Minimal fields: { "fields": ["id", "name"] }
  - Markdown format: { "limit": 25, "response_format": "markdown" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks ads_read permission`,
    {
      limit: createLimitSchema("accounts"),
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(async ({ limit, fields }, { client, format }) => {
      const response = await client.getAdAccounts(limit ?? 25, fields);

      return createSuccessResponse(
        {
          accounts: response.data,
          paging: enhancePagination(response.paging, response.data, {
            totalCount: response.summary?.total_count,
            limit: limit ?? 25,
          }),
        },
        format,
      );
    }),
  );

  /**
   * Get detailed information about a specific ad account
   */
  server.tool(
    "meta_get_account_info",
    `Get detailed information about a specific ad account.

Retrieves comprehensive details about a single ad account including status, currency, timezone, spending limits, and account-level settings. Account ID can be provided with or without the 'act_' prefix.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - fields (array[string], optional): Specific account fields to return
  - user_id (string, optional): User ID for multi-user auth (default: 'default')

Returns:
  {
    "success": true,
    "account": {
      "id": "act_123456789",
      "account_id": "123456789",
      "name": "My Ad Account",
      "account_status": 1,
      "currency": "USD",
      "timezone_name": "America/New_York",
      "timezone_offset_hours_utc": -5,
      "capabilities": ["BILLING", "CAN_CREATE_ADS"],
      "spend_cap": 100000,
      "amount_spent": 50000
    }
  }

Examples:
  - With act_ prefix: { "account_id": "act_123456789" }
  - Without prefix: { "account_id": "123456789" }
  - Minimal fields: { "account_id": "act_123", "fields": ["id", "name", "currency"] }
  - Markdown format: { "account_id": "act_123", "response_format": "markdown" }

Errors:
  - 190: Token expired - use meta_get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry
  - 10/200/294: Permission denied - user lacks access to this account
  - 100: Invalid account ID format`,
    {
      account_id: accountIdSchema,
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(async ({ account_id, fields }, { client, format }) => {
      const normalizedId = normalizeAccountId(account_id);
      const account = await client.getAccountInfo(normalizedId, fields);

      return createSuccessResponse({ account }, format);
    }),
  );

  server.tool(
    "meta_get_custom_audiences",
    `List custom audiences for an ad account.

Retrieves custom audiences (including lookalike sources and uploaded audiences) for a Meta ad account. Supports pagination and field selection.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - limit (number, optional): Maximum audiences to return, 1-100 (default: 25)
  - after (string, optional): Pagination cursor to fetch the next page
  - before (string, optional): Pagination cursor to fetch the previous page
  - fields (array[string], optional): Specific audience fields to return
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      account_id: accountIdSchema,
      limit: createLimitSchema("custom audiences"),
      after: paginationCursorSchema,
      before: paginationCursorSchema,
      fields: fieldsSchema,
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    READ_ONLY_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, limit, after, before, fields },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const response = await client.getCustomAudiences(normalizedId, {
          limit: limit ?? 25,
          after,
          before,
          fields,
        });

        return createSuccessResponse(
          {
            audiences: response.data,
            paging: enhancePagination(response.paging, response.data, {
              totalCount: response.summary?.total_count,
              limit: limit ?? 25,
              cursorProvided: !!after || !!before,
            }),
          },
          format,
        );
      },
    ),
  );

  server.tool(
    "meta_create_custom_audience",
    `Create a custom audience in an ad account.

Creates a custom audience resource (for example customer list or website audience). Returns the new audience ID.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - name (string, required): Audience name
  - subtype (string, optional): Audience subtype (default: CUSTOM)
  - description (string, optional): Audience description
  - customer_file_source (string, optional): Customer data source metadata
  - rule (object, optional): Audience rule object (commonly used for website audiences)
  - retention_days (number, optional): Retention window in days
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      account_id: accountIdSchema,
      name: z.string().min(1).describe("Audience name"),
      subtype: z.string().optional().describe("Audience subtype"),
      description: z.string().optional().describe("Audience description"),
      customer_file_source: z
        .string()
        .optional()
        .describe("Customer file source metadata"),
      rule: z.record(z.unknown()).optional().describe("Audience rule object"),
      retention_days: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Retention window in days"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async (
        {
          account_id,
          name,
          subtype,
          description,
          customer_file_source,
          rule,
          retention_days,
        },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const result = await client.createCustomAudience(normalizedId, {
          name,
          subtype,
          description,
          customer_file_source,
          rule,
          retention_days,
        });

        return createSuccessResponse(
          {
            audience_id: result.id,
            message: `Custom audience "${name}" created successfully`,
          },
          format,
        );
      },
    ),
  );

  server.tool(
    "meta_create_lookalike_audience",
    `Create a lookalike audience from an origin audience.

Creates a LOOKALIKE audience in an ad account using an existing source audience ID and lookalike_spec.

Args:
  - account_id (string, required): Ad account ID (with or without 'act_' prefix)
  - name (string, required): Lookalike audience name
  - origin_audience_id (string, required): Source audience ID
  - lookalike_spec (object, required): Lookalike spec (for example { country: 'US', ratio: 0.01 })
  - description (string, optional): Audience description
  - user_id (string, optional): User ID for multi-user auth (default: 'default')`,
    {
      account_id: accountIdSchema,
      name: z.string().min(1).describe("Lookalike audience name"),
      origin_audience_id: z.string().min(1).describe("Source audience ID"),
      lookalike_spec: z
        .record(z.unknown())
        .describe("Lookalike specification object"),
      description: z.string().optional().describe("Audience description"),
      user_id: userIdSchema,
      response_format: responseFormatSchema,
    },
    CREATE_ANNOTATIONS,
    withToolHandler(
      async (
        { account_id, name, origin_audience_id, lookalike_spec, description },
        { client, format },
      ) => {
        const normalizedId = normalizeAccountId(account_id);
        const result = await client.createLookalikeAudience(normalizedId, {
          name,
          origin_audience_id,
          lookalike_spec,
          description,
        });

        return createSuccessResponse(
          {
            audience_id: result.id,
            message: `Lookalike audience "${name}" created successfully`,
          },
          format,
        );
      },
    ),
  );
}
