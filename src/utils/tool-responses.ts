/**
 * Utility functions for creating standardized MCP tool responses.
 */

import { MetaApiError } from "../api/error-handling.js";

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
 * For MetaApiError, returns full error details including user-friendly messages,
 * error codes, and the blame_field that identifies which parameter caused the error.
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
  // Handle Meta API errors with full details
  if (error instanceof MetaApiError) {
    const errorDetails: Record<string, unknown> = {
      message: error.userMessage || error.message,
      code: error.code,
      type: error.type,
    };

    // Include optional fields only if present
    if (error.userTitle) {
      errorDetails["title"] = error.userTitle;
    }
    if (error.subcode) {
      errorDetails["subcode"] = error.subcode;
    }
    if (error.blameField) {
      errorDetails["blame_field"] = error.blameField;
    }
    if (error.fbtrace_id) {
      errorDetails["fbtrace_id"] = error.fbtrace_id;
    }
    errorDetails["is_retryable"] = error.isRetryable;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { success: false, error: errorDetails },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  // Fallback for non-Meta errors
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
