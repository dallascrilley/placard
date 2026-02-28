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

export type ResponseFormat = "json" | "markdown" | "compact";

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
  total_count?: number;
  page?: {
    current: number | null;
    total: number;
  };
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
  options: {
    totalCount?: number | undefined;
    limit?: number | undefined;
    cursorProvided?: boolean | undefined;
  } = {},
): EnhancedPaging {
  const totalCount = options.totalCount;
  const totalPages =
    totalCount !== undefined && options.limit && options.limit > 0
      ? Math.ceil(totalCount / options.limit)
      : undefined;

  return {
    ...paging,
    has_more: !!paging?.next,
    count: dataArray.length,
    ...(totalCount !== undefined ? { total_count: totalCount } : {}),
    ...(totalPages !== undefined
      ? {
          page: {
            current: options.cursorProvided ? null : 1,
            total: totalPages,
          },
        }
      : {}),
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
 * Renders an array of entities as markdown sections with headers.
 */
function formatArraySection(key: string, items: unknown[]): string[] {
  if (items.length === 0) {
    return [`\n### ${formatKeyAsTitle(key)}\n\nNo ${key} found.`];
  }

  const sections: string[] = [
    `\n### ${formatKeyAsTitle(key)} (${items.length})`,
  ];
  for (const item of items) {
    if (typeof item !== "object" || item === null) {
      sections.push(`- ${formatValue(item)}`);
      continue;
    }
    const obj = item as Record<string, unknown>;
    const id =
      obj["id"] || obj["campaign_id"] || obj["adset_id"] || obj["ad_id"];
    const name = obj["name"];
    if (id && name) {
      sections.push(`\n#### ${name} (${id})`);
    } else if (id) {
      sections.push(`\n#### ID: ${id}`);
    }
    sections.push(formatValue(item, 0));
  }
  return sections;
}

/**
 * Formats a single data key/value pair as markdown.
 */
function formatDataEntry(key: string, value: unknown): string[] {
  if (value === undefined) return [];

  if (Array.isArray(value)) {
    return formatArraySection(key, value);
  }
  if (typeof value === "object" && value !== null) {
    return [`\n### ${formatKeyAsTitle(key)}`, formatValue(value, 0)];
  }
  return [`\n**${formatKeyAsTitle(key)}:** ${value}`];
}

/**
 * Renders pagination metadata as a markdown footer.
 */
function formatPagingFooter(paging: Record<string, unknown>): string {
  const hasMore = !!paging["next"];
  return `\n---\n*${hasMore ? "More results available" : "No more results"}*`;
}

/**
 * Converts a data object to human-readable markdown.
 */
function toMarkdown(data: Record<string, unknown>): string {
  const sections: string[] = [];

  if (data["success"] !== undefined) {
    sections.push(data["success"] ? "✓ **Success**" : "✗ **Failed**");
  }

  if (data["message"]) {
    sections.push(`\n${data["message"]}`);
  }

  const dataKeys = Object.keys(data).filter(
    (k) => !["success", "message", "paging"].includes(k),
  );

  for (const key of dataKeys) {
    sections.push(...formatDataEntry(key, data[key]));
  }

  if (data["paging"] && typeof data["paging"] === "object") {
    sections.push(
      formatPagingFooter(data["paging"] as Record<string, unknown>),
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
const PRESERVED_SUMMARY_KEYS = new Set(["paging", "has_more", "count"]);

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
  const preserved = getPreservedMetadata(responseData);
  for (const key of Object.keys(preserved)) {
    delete preview[key];
  }

  for (const [key, value] of Object.entries(responseData)) {
    if (key === "success" || PRESERVED_SUMMARY_KEYS.has(key)) {
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
    ...preserved,
    preview,
  };
}

function getPreservedMetadata(
  responseData: Record<string, unknown>,
): Record<string, unknown> {
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(responseData)) {
    if (PRESERVED_SUMMARY_KEYS.has(key)) {
      preserved[key] = value;
    }
  }
  return preserved;
}

function buildCompactPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const compact = { ...payload };
  const listEntry = Object.entries(payload).find(([key, value]) => {
    if (key === "success" || key === "paging") {
      return false;
    }
    return (
      Array.isArray(value) &&
      value.every(
        (item) =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    );
  });

  if (!listEntry) {
    return compact;
  }

  const [listKey, value] = listEntry;
  const rows = value as Array<Record<string, unknown>>;
  const headers: string[] = [];

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) {
        headers.push(key);
      }
    }
  }

  const compactRows: unknown[][] = rows.map((row) =>
    headers.map((key) => (key in row ? row[key] : null)),
  );

  compact[listKey] = [headers, ...compactRows];
  return compact;
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
      : format === "compact"
        ? JSON.stringify(buildCompactPayload(payload), null, 2)
        : JSON.stringify(payload, null, 2);
  let text = buildText(responseData);
  const originalSizeBytes = getByteSize(text);

  if (originalSizeBytes > maxSizeBytes) {
    const summarized = buildSizeManagedResponseData(
      responseData,
      originalSizeBytes,
      maxSizeBytes,
    );
    text = buildText(summarized);

    // Absolute fallback: guarantee we always return a bounded payload.
    if (getByteSize(text) > maxSizeBytes) {
      const preserved = getPreservedMetadata(responseData);
      const fallbackPayload: Record<string, unknown> = {
        success: true,
        truncated: true,
        warning:
          "Response exceeded size limit and could not include preview content.",
        original_size_bytes: originalSizeBytes,
        max_size_bytes: maxSizeBytes,
        ...preserved,
      };
      text = buildText(fallbackPayload);

      if (getByteSize(text) > maxSizeBytes) {
        text = JSON.stringify(fallbackPayload, null, 2);
      }
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

interface ErrorInfo {
  message: string;
  code?: string | number;
  details?: Record<string, unknown>;
}

const ERROR_MESSAGE_KEYS = ["message", "error", "error_message"] as const;
const ERROR_CODE_KEYS = ["code", "error_code"] as const;
const ERROR_METADATA_KEYS = new Set<string>([
  ...ERROR_MESSAGE_KEYS,
  ...ERROR_CODE_KEYS,
]);

/** Extracts the first string-typed value from known message fields. */
function extractMessage(obj: Record<string, unknown>): string | null {
  for (const key of ERROR_MESSAGE_KEYS) {
    if (typeof obj[key] === "string") return obj[key];
  }
  return null;
}

/** Extracts the first string/number code from known code fields. */
function extractCode(
  obj: Record<string, unknown>,
): string | number | undefined {
  for (const key of ERROR_CODE_KEYS) {
    const val = obj[key];
    if (typeof val === "string" || typeof val === "number") return val;
  }
  return undefined;
}

/** Collects object entries that aren't message/code metadata. */
function collectDetails(
  obj: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!ERROR_METADATA_KEYS.has(key) && value !== undefined) {
      details[key] = value;
    }
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Extracts error information from various error types.
 * Preserves context from API error objects with message/code/error fields.
 */
function extractErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof Error) return { message: error.message };
  if (typeof error === "string") return { message: error };

  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const message = extractMessage(obj);

    if (message) {
      const result: ErrorInfo = { message };
      const code = extractCode(obj);
      if (code !== undefined) result.code = code;
      const details = collectDetails(obj);
      if (details) result.details = details;
      return result;
    }

    try {
      return { message: JSON.stringify(obj) };
    } catch {
      return { message: "[Object]" };
    }
  }

  return { message: String(error) };
}

/** Builds a structured details object from a MetaApiError. */
function buildMetaErrorDetails(error: MetaApiError): Record<string, unknown> {
  const details: Record<string, unknown> = {
    message: error.userMessage || error.message,
    code: error.code,
    type: error.type,
    is_transient: error.isTransient,
    is_retryable: error.isRetryable,
  };
  if (error.userTitle) details["title"] = error.userTitle;
  if (error.subcode) details["subcode"] = error.subcode;
  if (error.blameField) details["blame_field"] = error.blameField;
  if (error.fbtrace_id) details["fbtrace_id"] = error.fbtrace_id;
  return details;
}

/** Renders a MetaApiError as a markdown string. */
function metaErrorToMarkdown(
  error: MetaApiError,
  details: Record<string, unknown>,
): string {
  const heading = details["title"]
    ? `✗ **${details["title"]}**`
    : "✗ **Error**";
  let text = `${heading}\n\n${details["message"]}\n\n**Code:** ${error.code}`;
  if (error.blameField) text += `\n**Field:** ${error.blameField}`;
  return text;
}

/** Renders generic ErrorInfo as a markdown string. */
function errorInfoToMarkdown(info: ErrorInfo): string {
  let text = `✗ **Error**\n\n${info.message}`;
  if (info.code !== undefined) text += `\n\n**Code:** ${info.code}`;
  if (info.details) {
    text += `\n\n**Details:**\n${JSON.stringify(info.details, null, 2)}`;
  }
  return text;
}

/** Wraps text content into an MCP error response. */
function errorResponse(text: string): ToolResponse {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
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
  if (error instanceof MetaApiError) {
    const details = buildMetaErrorDetails(error);
    if (format === "markdown") {
      return errorResponse(metaErrorToMarkdown(error, details));
    }
    return errorResponse(
      JSON.stringify({ success: false, error: details }, null, 2),
    );
  }

  const errorInfo = extractErrorInfo(error);

  if (format === "markdown") {
    return errorResponse(errorInfoToMarkdown(errorInfo));
  }

  const responseData: Record<string, unknown> = {
    success: false,
    error: errorInfo.message,
  };
  if (errorInfo.code !== undefined) responseData["error_code"] = errorInfo.code;
  if (errorInfo.details) responseData["error_details"] = errorInfo.details;

  return errorResponse(JSON.stringify(responseData, null, 2));
}
