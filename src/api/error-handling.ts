/**
 * Meta API Error Handling
 *
 * Structured error types and retry logic for the Meta Marketing API.
 */

export interface MetaApiErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

export class MetaApiError extends Error {
  readonly code: number;
  readonly type: string;
  readonly subcode: number | undefined;
  readonly fbtrace_id: string;
  readonly userTitle: string | undefined;
  readonly userMessage: string | undefined;
  readonly isRetryable: boolean;

  constructor(response: MetaApiErrorResponse) {
    super(response.error.message);
    this.name = "MetaApiError";
    this.code = response.error.code;
    this.type = response.error.type;
    this.subcode = response.error.error_subcode;
    this.fbtrace_id = response.error.fbtrace_id;
    this.userTitle = response.error.error_user_title;
    this.userMessage = response.error.error_user_msg;
    this.isRetryable = this.determineRetryable();
  }

  private determineRetryable(): boolean {
    // Rate limit errors are retryable
    if (this.code === 4 || this.code === 17 || this.code === 32) return true;
    if (this.code === 613 || this.code === 80004) return true; // API rate limit

    // Temporary errors
    if (this.code === 1 || this.code === 2) return true; // Unknown/temporary errors

    // Token errors are not retryable (need re-auth)
    if (this.code === 190) return false;

    // Permission errors are not retryable
    if (this.code === 10 || this.code === 200 || this.code === 294)
      return false;

    return false;
  }

  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      type: this.type,
      subcode: this.subcode,
      fbtrace_id: this.fbtrace_id,
      userTitle: this.userTitle,
      userMessage: this.userMessage,
      isRetryable: this.isRetryable,
    };
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends MetaApiError {
  readonly retryAfter: number | undefined;

  constructor(response: MetaApiErrorResponse, retryAfter?: number) {
    super(response);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Exponential backoff with jitter for retries
 */
export function calculateBackoff(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 60000,
): number {
  const exponentialDelay = baseDelay * 2 ** attempt;
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Sleep utility for retry delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for API calls
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 60000,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable =
        error instanceof MetaApiError ? error.isRetryable : false;

      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }

      // Calculate backoff
      let delay = calculateBackoff(attempt, baseDelay, maxDelay);

      // Use Retry-After header if available (for rate limits)
      if (error instanceof RateLimitError && error.retryAfter) {
        delay = error.retryAfter * 1000;
      }

      onRetry?.(lastError, attempt + 1);

      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Retry failed");
}

/**
 * Parse error response from Meta API
 */
export function parseApiError(
  response: Response,
  body: unknown,
): MetaApiError | Error {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as MetaApiErrorResponse).error === "object"
  ) {
    const errorResponse = body as MetaApiErrorResponse;

    // Check for rate limit
    if (
      errorResponse.error.code === 4 ||
      errorResponse.error.code === 17 ||
      errorResponse.error.code === 32 ||
      errorResponse.error.code === 613 ||
      errorResponse.error.code === 80004
    ) {
      const retryAfter = response.headers.get("Retry-After");
      return new RateLimitError(
        errorResponse,
        retryAfter ? Number.parseInt(retryAfter, 10) : undefined,
      );
    }

    return new MetaApiError(errorResponse);
  }

  return new Error(
    `API request failed: ${response.status} ${response.statusText}`,
  );
}
