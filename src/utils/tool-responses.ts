/**
 * Utility functions for creating standardized MCP tool responses.
 */

/**
 * MCP tool response structure.
 */
export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Creates a standardized success response for MCP tools.
 *
 * @param data - The data to include in the response
 * @returns A formatted MCP tool response with success: true
 *
 * @example
 * return createSuccessResponse({ campaigns: data, paging });
 */
export function createSuccessResponse(
  data: Record<string, unknown>,
): ToolResponse {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, ...data }, null, 2),
      },
    ],
  };
}

/**
 * Creates a standardized error response for MCP tools.
 *
 * @param error - The error (Error instance, string, or unknown)
 * @returns A formatted MCP tool response with success: false and isError: true
 *
 * @example
 * catch (error) {
 *   return createErrorResponse(error);
 * }
 */
export function createErrorResponse(error: unknown): ToolResponse {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: false, error: message }, null, 2),
      },
    ],
    isError: true,
  };
}
