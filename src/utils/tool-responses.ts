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

export type ResponseFormat = "json" | "markdown";

/**
 * Meta API paging structure.
 */
export interface MetaPaging {
  cursors?: {
    before?: string;
    after?: string;
  };
  next?: string;
  previous?: string;
}

/**
 * Enhanced pagination metadata.
 */
export interface EnhancedPaging extends MetaPaging {
  has_more: boolean;
  count: number;
}

/**
 * Enhances pagination metadata with has_more and count fields.
 *
 * @param paging - The original Meta API paging object
 * @param dataArray - The array of results to count
 * @returns Enhanced paging object with has_more and count
 */
export function enhancePagination(
  paging: MetaPaging | undefined,
  dataArray: unknown[],
): EnhancedPaging {
  return {
    ...paging,
    has_more: !!paging?.next,
    count: dataArray.length,
  };
}

/**
 * Formats a value for markdown output.
 */
function formatValue(value: unknown, indent = 0): string {
  const prefix = "  ".repeat(indent);

  if (value === null || value === undefined) {
    return "null";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item, i) => `${prefix}- ${formatValue(item, indent + 1)}`)
      .join("\n");
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, val]) => {
        const formattedVal = formatValue(val, indent + 1);
        if (typeof val === "object" && val !== null && !Array.isArray(val)) {
          return `${prefix}**${key}:**\n${formattedVal}`;
        }
        if (Array.isArray(val) && val.length > 0) {
          return `${prefix}**${key}:**\n${formattedVal}`;
        }
        return `${prefix}**${key}:** ${formattedVal}`;
      })
      .join("\n");
  }

  return String(value);
}

/**
 * Converts a data object to human-readable markdown.
 */
function toMarkdown(data: Record<string, unknown>): string {
  const sections: string[] = [];

  // Handle common response patterns
  if (data["success"] !== undefined) {
    sections.push(data["success"] ? "✓ **Success**" : "✗ **Failed**");
  }

  if (data["message"]) {
    sections.push(`\n${data["message"]}`);
  }

  // Format main data entities
  const dataKeys = Object.keys(data).filter(
    (k) => !["success", "message", "paging"].includes(k),
  );

  for (const key of dataKeys) {
    const value = data[key];
    if (value === undefined) continue;

    // Special handling for arrays (lists of entities)
    if (Array.isArray(value)) {
      if (value.length === 0) {
        sections.push(`\n### ${formatKeyAsTitle(key)}\n\nNo ${key} found.`);
      } else {
        sections.push(`\n### ${formatKeyAsTitle(key)} (${value.length})`);
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            const obj = item as Record<string, unknown>;
            const id =
              obj["id"] ||
              obj["campaign_id"] ||
              obj["adset_id"] ||
              obj["ad_id"];
            const name = obj["name"];
            if (id && name) {
              sections.push(`\n#### ${name} (${id})`);
            } else if (id) {
              sections.push(`\n#### ID: ${id}`);
            }
            sections.push(formatValue(item, 0));
          } else {
            sections.push(`- ${formatValue(item)}`);
          }
        }
      }
    } else if (typeof value === "object" && value !== null) {
      sections.push(`\n### ${formatKeyAsTitle(key)}`);
      sections.push(formatValue(value, 0));
    } else {
      sections.push(`\n**${formatKeyAsTitle(key)}:** ${value}`);
    }
  }

  // Handle pagination
  if (data["paging"] && typeof data["paging"] === "object") {
    const paging = data["paging"] as Record<string, unknown>;
    const hasMore = !!paging["next"];
    sections.push(
      `\n---\n*${hasMore ? "More results available" : "No more results"}*`,
    );
  }

  return sections.join("\n");
}

/**
 * Converts a snake_case or camelCase key to a title.
 */
function formatKeyAsTitle(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEFAULT_MAX_RESPONSE_BYTES = 100 * 1024;

function getMaxResponseBytes(): number {
  const raw = process.env["MCP_RESPONSE_MAX_BYTES"];
  if (!raw) {
    return DEFAULT_MAX_RESPONSE_BYTES;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_RESPONSE_BYTES;
  }

  return Math.floor(parsed);
}

function getByteSize(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function summarizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const sample = value.slice(0, 2).map((item) => summarizeValue(item));
    return {
      type: "array",
      count: value.length,
      sample,
    };
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const sampleKeys = keys.slice(0, 10);
    const sample: Record<string, unknown> = {};
    for (const key of sampleKeys) {
      sample[key] = summarizeValue(obj[key]);
    }
    return {
      type: "object",
      key_count: keys.length,
      sample,
    };
  }

  return String(value);
}

function buildSizeManagedResponseData(
  responseData: Record<string, unknown>,
  originalSizeBytes: number,
  maxSizeBytes: number,
): Record<string, unknown> {
  const preview: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(responseData)) {
    if (key === "success") {
      continue;
    }
    preview[key] = summarizeValue(value);
  }

  return {
    success: true,
    truncated: true,
    warning:
      "Response exceeded size limit and was summarized. Use fields/limit/pagination to request smaller payloads.",
    original_size_bytes: originalSizeBytes,
    max_size_bytes: maxSizeBytes,
    preview,
  };
}

/**
 * Creates a standardized success response for MCP tools.
 *
 * @param data - The data to include in the response
 * @param format - Response format: 'json' (default) or 'markdown'
 * @returns A formatted MCP tool response with success: true
 *
 * @example
 * return createSuccessResponse({ campaigns: data, paging });
 * return createSuccessResponse({ campaigns: data }, 'markdown');
 */
export function createSuccessResponse(
  data: Record<string, unknown>,
  format: ResponseFormat = "json",
): ToolResponse {
  const responseData = { success: true, ...data };
  const maxSizeBytes = getMaxResponseBytes();
  const buildText = (payload: Record<string, unknown>): string =>
    format === "markdown"
      ? toMarkdown(payload)
      : JSON.stringify(payload, null, 2);
  let text = buildText(responseData);

  if (getByteSize(text) > maxSizeBytes) {
    const summarized = buildSizeManagedResponseData(
      responseData,
      getByteSize(text),
      maxSizeBytes,
    );
    text = buildText(summarized);

    // Absolute fallback: guarantee we always return a bounded payload.
    if (getByteSize(text) > maxSizeBytes) {
      text = JSON.stringify(
        {
          success: true,
          truncated: true,
          warning:
            "Response exceeded size limit and could not include preview content.",
          original_size_bytes: getByteSize(buildText(responseData)),
          max_size_bytes: maxSizeBytes,
        },
        null,
        2,
      );
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

/**
 * Extracts error information from various error types.
 * Preserves context from API error objects with message/code/error fields.
 */
function extractErrorInfo(error: unknown): {
  message: string;
  code?: string | number;
  details?: Record<string, unknown>;
} {
  if (error instanceof Error) {
    return { message: error.message };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  // Handle plain objects with common error fields
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;

    // Extract message from common fields
    const message =
      typeof obj["message"] === "string"
        ? obj["message"]
        : typeof obj["error"] === "string"
          ? obj["error"]
          : typeof obj["error_message"] === "string"
            ? obj["error_message"]
            : null;

    // Extract error code
    const code =
      typeof obj["code"] === "number" || typeof obj["code"] === "string"
        ? obj["code"]
        : typeof obj["error_code"] === "number" ||
            typeof obj["error_code"] === "string"
          ? obj["error_code"]
          : undefined;

    if (message) {
      // Collect additional context fields
      const details: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (
          !["message", "error", "error_message", "code", "error_code"].includes(
            key,
          ) &&
          value !== undefined
        ) {
          details[key] = value;
        }
      }
      const result: {
        message: string;
        code?: string | number;
        details?: Record<string, unknown>;
      } = { message };
      if (code !== undefined) {
        result.code = code;
      }
      if (Object.keys(details).length > 0) {
        result.details = details;
      }
      return result;
    }

    // Fallback: stringify the entire object
    try {
      return { message: JSON.stringify(obj) };
    } catch {
      return { message: "[Object]" };
    }
  }

  return { message: String(error) };
}

/**
 * Creates a standardized error response for MCP tools.
 *
 * For MetaApiError, returns full error details including user-friendly messages,
 * error codes, and the blame_field that identifies which parameter caused the error.
 *
 * @param error - The error (Error instance, string, or unknown)
 * @param format - Response format: 'json' (default) or 'markdown'
 * @returns A formatted MCP tool response with success: false and isError: true
 *
 * @example
 * catch (error) {
 *   return createErrorResponse(error);
 * }
 */
export function createErrorResponse(
  error: unknown,
  format: ResponseFormat = "json",
): ToolResponse {
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
    errorDetails["is_transient"] = error.isTransient;
    errorDetails["is_retryable"] = error.isRetryable;

    if (format === "markdown") {
      let text = `✗ **Error**\n\n${errorDetails["message"]}`;
      if (errorDetails["title"]) {
        text = `✗ **${errorDetails["title"]}**\n\n${errorDetails["message"]}`;
      }
      text += `\n\n**Code:** ${error.code}`;
      if (error.blameField) {
        text += `\n**Field:** ${error.blameField}`;
      }
      return {
        content: [{ type: "text" as const, text }],
        isError: true,
      };
    }

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

  // Fallback for non-Meta errors using extractErrorInfo
  const errorInfo = extractErrorInfo(error);

  if (format === "markdown") {
    let text = `✗ **Error**\n\n${errorInfo.message}`;
    if (errorInfo.code !== undefined) {
      text += `\n\n**Code:** ${errorInfo.code}`;
    }
    if (errorInfo.details) {
      text += `\n\n**Details:**\n${JSON.stringify(errorInfo.details, null, 2)}`;
    }
    return {
      content: [{ type: "text" as const, text }],
      isError: true,
    };
  }

  const responseData: Record<string, unknown> = {
    success: false,
    error: errorInfo.message,
  };
  if (errorInfo.code !== undefined) {
    responseData["error_code"] = errorInfo.code;
  }
  if (errorInfo.details) {
    responseData["error_details"] = errorInfo.details;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(responseData, null, 2),
      },
    ],
    isError: true,
  };
}
