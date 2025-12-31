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

  if (format === "markdown") {
    return {
      content: [
        {
          type: "text" as const,
          text: toMarkdown(responseData),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(responseData, null, 2),
      },
    ],
  };
}

/**
 * Creates a standardized error response for MCP tools.
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
  const message = error instanceof Error ? error.message : String(error);

  if (format === "markdown") {
    return {
      content: [
        {
          type: "text" as const,
          text: `✗ **Error**\n\n${message}`,
        },
      ],
      isError: true,
    };
  }

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
