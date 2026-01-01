import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationError,
  MetaApiError,
  RateLimitError,
  calculateBackoff,
  parseApiError,
  sleep,
  withRetry,
} from "../../api/error-handling.js";
import {
  createMetaErrorBody,
  createMockResponse,
} from "../utils/mock-fetch.js";

describe("MetaApiError", () => {
  it("should parse error response correctly", () => {
    const errorBody = createMetaErrorBody(
      190,
      "Invalid access token",
      "OAuthException",
    );
    const error = new MetaApiError(errorBody);

    expect(error.message).toBe("Invalid access token");
    expect(error.code).toBe(190);
    expect(error.type).toBe("OAuthException");
    expect(error.fbtrace_id).toBe("test-trace-id-123");
    expect(error.name).toBe("MetaApiError");
  });

  it("should include optional fields when present", () => {
    const errorBody = {
      error: {
        message: "Rate limit exceeded",
        type: "OAuthException",
        code: 4,
        error_subcode: 2207051,
        fbtrace_id: "trace-123",
        error_user_title: "Too Many Requests",
        error_user_msg: "Please wait before trying again",
      },
    };
    const error = new MetaApiError(errorBody);

    expect(error.subcode).toBe(2207051);
    expect(error.userTitle).toBe("Too Many Requests");
    expect(error.userMessage).toBe("Please wait before trying again");
  });

  it("should parse blame_field from error_data", () => {
    const errorBody = {
      error: {
        message: "Invalid parameter",
        type: "OAuthException",
        code: 100,
        fbtrace_id: "trace-123",
        error_data: '{"blame_field":"targeting"}',
      },
    };
    const error = new MetaApiError(errorBody);

    expect(error.blameField).toBe("targeting");
  });

  it("should handle missing error_data gracefully", () => {
    const errorBody = {
      error: {
        message: "Invalid parameter",
        type: "OAuthException",
        code: 100,
        fbtrace_id: "trace-123",
      },
    };
    const error = new MetaApiError(errorBody);

    expect(error.blameField).toBeUndefined();
  });

  it("should handle invalid JSON in error_data gracefully", () => {
    const errorBody = {
      error: {
        message: "Invalid parameter",
        type: "OAuthException",
        code: 100,
        fbtrace_id: "trace-123",
        error_data: "not valid json",
      },
    };
    const error = new MetaApiError(errorBody);

    expect(error.blameField).toBeUndefined();
  });

  it("should parse is_transient field", () => {
    const errorBody = {
      error: {
        message: "Temporary error",
        type: "OAuthException",
        code: 1,
        fbtrace_id: "trace-123",
        is_transient: true,
      },
    };
    const error = new MetaApiError(errorBody);

    expect(error.isTransient).toBe(true);
  });

  it("should default is_transient to false when missing", () => {
    const errorBody = {
      error: {
        message: "Error",
        type: "OAuthException",
        code: 100,
        fbtrace_id: "trace-123",
      },
    };
    const error = new MetaApiError(errorBody);

    expect(error.isTransient).toBe(false);
  });

  describe("isRetryable", () => {
    it("should mark rate limit codes as retryable", () => {
      const rateLimitCodes = [4, 17, 32, 613, 80004];
      for (const code of rateLimitCodes) {
        const error = new MetaApiError(createMetaErrorBody(code, "Rate limit"));
        expect(error.isRetryable).toBe(true);
      }
    });

    it("should mark temporary errors as retryable", () => {
      const tempCodes = [1, 2];
      for (const code of tempCodes) {
        const error = new MetaApiError(
          createMetaErrorBody(code, "Temporary error"),
        );
        expect(error.isRetryable).toBe(true);
      }
    });

    it("should mark token errors as not retryable", () => {
      const error = new MetaApiError(createMetaErrorBody(190, "Invalid token"));
      expect(error.isRetryable).toBe(false);
    });

    it("should mark permission errors as not retryable", () => {
      const permissionCodes = [10, 200, 294];
      for (const code of permissionCodes) {
        const error = new MetaApiError(
          createMetaErrorBody(code, "Permission denied"),
        );
        expect(error.isRetryable).toBe(false);
      }
    });

    it("should default to not retryable for unknown codes", () => {
      const error = new MetaApiError(createMetaErrorBody(999, "Unknown error"));
      expect(error.isRetryable).toBe(false);
    });

    it("should mark transient errors as retryable regardless of code", () => {
      const errorBody = {
        error: {
          message: "Transient error",
          type: "OAuthException",
          code: 999, // Unknown code
          fbtrace_id: "trace-123",
          is_transient: true,
        },
      };
      const error = new MetaApiError(errorBody);
      expect(error.isRetryable).toBe(true);
    });
  });

  describe("toJSON", () => {
    it("should serialize all properties", () => {
      const errorBody = {
        error: {
          message: "Test error",
          type: "TestType",
          code: 123,
          error_subcode: 456,
          fbtrace_id: "trace-abc",
          error_user_title: "User Title",
          error_user_msg: "User Message",
        },
      };
      const error = new MetaApiError(errorBody);
      const json = error.toJSON();

      expect(json).toEqual({
        name: "MetaApiError",
        message: "Test error",
        code: 123,
        type: "TestType",
        subcode: 456,
        fbtrace_id: "trace-abc",
        userTitle: "User Title",
        userMessage: "User Message",
        blameField: undefined,
        isTransient: false,
        isRetryable: false,
      });
    });

    it("should serialize with blameField and isTransient present", () => {
      const errorBody = {
        error: {
          message: "Invalid parameter",
          type: "OAuthException",
          code: 100,
          error_subcode: 1487756,
          fbtrace_id: "trace-xyz",
          error_user_title: "Locations can't be used",
          error_user_msg: "Some of your locations overlap.",
          error_data: '{"blame_field":"targeting"}',
          is_transient: true,
        },
      };
      const error = new MetaApiError(errorBody);
      const json = error.toJSON();

      expect(json).toEqual({
        name: "MetaApiError",
        message: "Invalid parameter",
        code: 100,
        type: "OAuthException",
        subcode: 1487756,
        fbtrace_id: "trace-xyz",
        userTitle: "Locations can't be used",
        userMessage: "Some of your locations overlap.",
        blameField: "targeting",
        isTransient: true,
        isRetryable: true, // true because isTransient is true
      });
    });
  });
});

describe("AuthenticationError", () => {
  it("should create error with message", () => {
    const error = new AuthenticationError("Not authenticated");
    expect(error.message).toBe("Not authenticated");
    expect(error.name).toBe("AuthenticationError");
  });
});

describe("RateLimitError", () => {
  it("should extend MetaApiError", () => {
    const errorBody = createMetaErrorBody(4, "Rate limit exceeded");
    const error = new RateLimitError(errorBody);

    expect(error).toBeInstanceOf(MetaApiError);
    expect(error.name).toBe("RateLimitError");
    expect(error.isRetryable).toBe(true);
  });

  it("should store retryAfter when provided", () => {
    const errorBody = createMetaErrorBody(4, "Rate limit exceeded");
    const error = new RateLimitError(errorBody, 30);

    expect(error.retryAfter).toBe(30);
  });

  it("should have undefined retryAfter when not provided", () => {
    const errorBody = createMetaErrorBody(4, "Rate limit exceeded");
    const error = new RateLimitError(errorBody);

    expect(error.retryAfter).toBeUndefined();
  });
});

describe("calculateBackoff", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should calculate exponential backoff", () => {
    // With 0.5 random, jitter = 0.5 * 0.3 * delay = 0.15 * delay
    // attempt 0: 1000 * 2^0 = 1000, jitter = 150, total = 1150
    expect(calculateBackoff(0, 1000, 60000)).toBe(1150);

    // attempt 1: 1000 * 2^1 = 2000, jitter = 300, total = 2300
    expect(calculateBackoff(1, 1000, 60000)).toBe(2300);

    // attempt 2: 1000 * 2^2 = 4000, jitter = 600, total = 4600
    expect(calculateBackoff(2, 1000, 60000)).toBe(4600);
  });

  it("should respect maxDelay", () => {
    // attempt 10: 1000 * 2^10 = 1024000, but maxDelay is 60000
    expect(calculateBackoff(10, 1000, 60000)).toBe(60000);
  });

  it("should use custom base delay", () => {
    // attempt 0: 500 * 2^0 = 500, jitter = 75, total = 575
    expect(calculateBackoff(0, 500, 60000)).toBe(575);
  });
});

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve after specified time", async () => {
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should return result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on retryable errors", async () => {
    const retryableError = new MetaApiError(
      createMetaErrorBody(4, "Rate limit"),
    );
    const fn = vi
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce("success");

    const promise = withRetry(fn, { baseDelay: 1000, maxRetries: 3 });

    // First call fails immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Wait for backoff (1000ms for attempt 0)
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe("success");
  });

  it("should not retry non-retryable errors", async () => {
    const nonRetryableError = new MetaApiError(
      createMetaErrorBody(190, "Invalid token"),
    );
    const fn = vi.fn().mockRejectedValue(nonRetryableError);

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(
      nonRetryableError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should not retry non-MetaApiError errors", async () => {
    const genericError = new Error("Network error");
    const fn = vi.fn().mockRejectedValue(genericError);

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(
      genericError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should stop after maxRetries", async () => {
    const retryableError = new MetaApiError(
      createMetaErrorBody(4, "Rate limit"),
    );
    const fn = vi.fn().mockRejectedValue(retryableError);

    // Use real timers for this test to avoid unhandled rejection timing issues
    vi.useRealTimers();

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 1 }),
    ).rejects.toThrow(retryableError);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries

    // Restore fake timers for other tests
    vi.useFakeTimers();
  });

  it("should call onRetry callback", async () => {
    const retryableError = new MetaApiError(
      createMetaErrorBody(4, "Rate limit"),
    );
    const fn = vi
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce("success");
    const onRetry = vi.fn();

    const promise = withRetry(fn, { baseDelay: 100, onRetry });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    await promise;
    expect(onRetry).toHaveBeenCalledWith(retryableError, 1);
  });

  it("should use Retry-After header for RateLimitError", async () => {
    const rateLimitError = new RateLimitError(
      createMetaErrorBody(4, "Rate limit"),
      5,
    );
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce("success");

    const promise = withRetry(fn, { baseDelay: 1000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Should use retryAfter (5s = 5000ms) instead of calculated backoff
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result).toBe("success");
  });
});

describe("parseApiError", () => {
  it("should parse Meta API error response", () => {
    const body = createMetaErrorBody(190, "Invalid access token");
    const response = createMockResponse({ status: 400 });

    const error = parseApiError(response, body);

    expect(error).toBeInstanceOf(MetaApiError);
    expect((error as MetaApiError).code).toBe(190);
    expect(error.message).toBe("Invalid access token");
  });

  it("should return RateLimitError for rate limit codes", () => {
    const rateLimitCodes = [4, 17, 32, 613, 80004];

    for (const code of rateLimitCodes) {
      const body = createMetaErrorBody(code, "Rate limit");
      const response = createMockResponse({
        status: 429,
        headers: { "Retry-After": "30" },
      });

      const error = parseApiError(response, body);

      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfter).toBe(30);
    }
  });

  it("should handle missing Retry-After header", () => {
    const body = createMetaErrorBody(4, "Rate limit");
    const response = createMockResponse({ status: 429 });

    const error = parseApiError(response, body);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfter).toBeUndefined();
  });

  it("should return generic Error for non-Meta error responses", () => {
    const response = createMockResponse({
      status: 500,
      statusText: "Internal Server Error",
    });

    const error = parseApiError(response, { message: "Something went wrong" });

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(MetaApiError);
    expect(error.message).toBe("API request failed: 500 Internal Server Error");
  });

  it("should handle null body", () => {
    const response = createMockResponse({
      status: 500,
      statusText: "Internal Server Error",
    });

    const error = parseApiError(response, null);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("API request failed: 500 Internal Server Error");
  });
});
