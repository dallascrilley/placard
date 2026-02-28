/**
 * Tool Handler Wrapper
 *
 * Eliminates boilerplate across MCP tool handlers:
 * - Format extraction from response_format
 * - MetaClient instantiation with user_id
 * - Try/catch with standardized error responses
 */

import { type MetaClient, createMetaClient } from "../api/meta-client.js";
import {
  type ResponseFormat,
  type ToolResponse,
  createErrorResponse,
} from "./tool-responses.js";

/** Context injected into every tool handler by the wrapper. */
export interface ToolContext {
  client: MetaClient;
  format: ResponseFormat;
}

// biome-ignore lint/suspicious/noExplicitAny: Zod validates params at runtime; see JSDoc below
type ToolParams = Record<string, any>;

/**
 * Wraps an MCP tool handler with standard format/client/error boilerplate.
 *
 * The returned function:
 * 1. Extracts `response_format` and `user_id` from the Zod-validated params
 * 2. Creates a MetaClient bound to the user
 * 3. Delegates to the inner handler with a typed {@link ToolContext}
 * 4. Catches errors and returns a standardized error response
 *
 * Compatible with MCP SDK's `server.tool()` callback signature:
 * `(args: ShapeOutput<Schema>, extra: RequestHandlerExtra) => CallToolResult`.
 *
 * Note: Params are typed as `Record<string, any>` because the Zod schema on
 * `server.tool()` handles runtime validation. Handlers destructure freely.
 */
export function withToolHandler(
  handler: (params: ToolParams, ctx: ToolContext) => Promise<ToolResponse>,
  // biome-ignore lint/suspicious/noExplicitAny: must match MCP SDK RequestHandlerExtra
): (params: ToolParams, extra: any) => Promise<ToolResponse> {
  return async (params, _extra) => {
    const format: ResponseFormat = params["response_format"] ?? "json";
    const client = createMetaClient({
      userId: params["user_id"] ?? "default",
    });
    try {
      return await handler(params, { client, format });
    } catch (error) {
      return createErrorResponse(error, format);
    }
  };
}
