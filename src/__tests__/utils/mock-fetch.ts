import { vi } from "vitest";
import type { MetaApiErrorResponse } from "../../api/error-handling.js";

export interface MockResponse {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * Create a mock Response object
 */
export function createMockResponse(options: MockResponse = {}): Response {
  const { status = 200, statusText = "OK", headers = {}, body = {} } = options;

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone: function () {
      return this;
    },
  } as Response;
}

/**
 * Create a Meta API error response body
 */
export function createMetaErrorBody(
  code: number,
  message: string,
  type = "OAuthException",
  subcode?: number,
): MetaApiErrorResponse {
  if (subcode !== undefined) {
    return {
      error: {
        message,
        type,
        code,
        error_subcode: subcode,
        fbtrace_id: "test-trace-id-123",
      },
    };
  }

  return {
    error: {
      message,
      type,
      code,
      fbtrace_id: "test-trace-id-123",
    },
  };
}

/**
 * Create a mock fetch function
 */
export function createMockFetch(response: MockResponse = {}): typeof fetch {
  return vi.fn().mockResolvedValue(createMockResponse(response));
}

/**
 * Create a mock fetch that fails with network error
 */
export function createNetworkErrorFetch(
  message = "Network error",
): typeof fetch {
  return vi.fn().mockRejectedValue(new Error(message));
}

/**
 * Create a mock fetch that returns different responses on successive calls
 */
export function createSequentialFetch(responses: MockResponse[]): typeof fetch {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(createMockResponse(response));
  });
}
