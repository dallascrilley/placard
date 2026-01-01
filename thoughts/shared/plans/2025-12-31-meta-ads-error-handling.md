# Plan: Meta Ads MCP Error Handling Improvements

## Objective

Improve error messages for Meta Ads MCP tools to provide actionable feedback instead of vague "Invalid parameter" errors. Users should know which parameter failed, why, and what to do about it.

## Context

**Testing Summary:** 23/27 tools work well. 2 tools (create_adset, create_ad_creative) return unhelpful errors. 1 tool (create_campaign) has misleading schema documentation.

**Root Cause Analysis:**

1. `createErrorResponse()` at `src/utils/tool-responses.ts:47-58` only extracts `error.message` - it discards `userTitle`, `userMessage`, `code`, `subcode`, and `fbtrace_id`

2. `MetaApiError` class at `src/api/error-handling.ts:19-71` already captures all Meta API error fields, but they're not surfaced to tool responses

3. Campaign budget validation is missing - schema says optional but Meta API requires at least one budget

**Key Files:**
- `src/utils/tool-responses.ts` - Error formatting
- `src/api/error-handling.ts` - Error classes with full Meta API details
- `src/schemas/common.ts` - Budget schemas
- `src/tools/campaigns.ts:88-150` - Campaign creation

---

## Phases

### Phase 1: Enhanced Error Response Formatting
**Priority:** High | **Effort:** Small

**Changes:**
- `src/utils/tool-responses.ts`: Update `createErrorResponse()` to detect `MetaApiError` and extract full error details

**Implementation:**
```typescript
export function createErrorResponse(error: unknown): ToolResponse {
  if (error instanceof MetaApiError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: {
              message: error.userMessage || error.message,
              title: error.userTitle,
              code: error.code,
              subcode: error.subcode,
              type: error.type,
              fbtrace_id: error.fbtrace_id,
              is_retryable: error.isRetryable,
            },
          }, null, 2),
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
```

**Success criteria:**
- [ ] Error responses include `title`, `code`, `subcode`, `fbtrace_id`
- [ ] User-friendly message (`userMessage`) shown when available
- [ ] Existing tests pass
- [ ] New test verifies MetaApiError formatting

---

### Phase 2: Extract blame_field from error_data
**Priority:** High | **Effort:** Small

**Changes:**
- `src/api/error-handling.ts`: Add `error_data` parsing to `MetaApiErrorResponse` interface
- `src/api/error-handling.ts`: Add `blameField` property to `MetaApiError` class

**Implementation:**
Update interface at line 7:
```typescript
export interface MetaApiErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
    error_user_title?: string;
    error_user_msg?: string;
    error_data?: string;  // JSON string containing blame_field
  };
}
```

Update class at line 19:
```typescript
export class MetaApiError extends Error {
  // ... existing fields
  readonly blameField: string | undefined;

  constructor(response: MetaApiErrorResponse) {
    // ... existing code
    this.blameField = this.parseBlameField(response.error.error_data);
  }

  private parseBlameField(errorData?: string): string | undefined {
    if (!errorData) return undefined;
    try {
      const parsed = JSON.parse(errorData);
      return parsed.blame_field;
    } catch {
      return undefined;
    }
  }
}
```

Update `toJSON()` to include `blameField`.

**Success criteria:**
- [ ] `blameField` extracted from error_data JSON
- [ ] Error response includes which parameter caused the error
- [ ] Tests verify blame_field parsing

---

### Phase 3: Campaign Budget Validation
**Priority:** Medium | **Effort:** Small

**Changes:**
- `src/tools/campaigns.ts`: Add Zod refinement to require at least one budget type

**Implementation:**
Update schema at line 88:
```typescript
server.tool(
  "create_campaign",
  "Create a new advertising campaign. Requires either daily_budget OR lifetime_budget.",
  {
    // ... existing fields ...
    daily_budget: dailyBudgetSchema.describe(
      "Daily budget in cents (required if no lifetime_budget)"
    ),
    lifetime_budget: lifetimeBudgetSchema.describe(
      "Lifetime budget in cents (required if no daily_budget)"
    ),
  },
```

Add validation in handler at line 121:
```typescript
async ({ /* ... */ }) => {
  try {
    // Validate budget requirement
    if (daily_budget === undefined && lifetime_budget === undefined) {
      return createErrorResponse(
        new Error("Either daily_budget or lifetime_budget is required")
      );
    }
    // ... rest of handler
```

**Success criteria:**
- [ ] Clear error when neither budget is provided
- [ ] Tool description updated to clarify requirement
- [ ] Both budget types work independently

---

### Phase 4: Add is_transient Field
**Priority:** Low | **Effort:** Minimal

**Changes:**
- `src/api/error-handling.ts`: Add `is_transient` to interface and class

**Implementation:**
```typescript
// In interface
is_transient?: boolean;

// In class
readonly isTransient: boolean;

// In constructor
this.isTransient = response.error.is_transient ?? false;
```

**Success criteria:**
- [ ] `is_transient` field captured from API response
- [ ] Can be used for retry decisions

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing error handling consumers | Keep fallback for non-MetaApiError; error.message still available |
| JSON parse failure for error_data | Try/catch with undefined fallback |
| Tests may expect old error format | Update test expectations to new format |

## Open Questions

- [ ] UNCONFIRMED: Should we log `fbtrace_id` separately for debugging while showing cleaner user errors?
- [ ] Should error responses include `is_retryable` hint for LLM agents?

---

## Verification Commands

```bash
# Typecheck
pnpm typecheck

# Lint
pnpm lint

# Test
pnpm test

# Build
pnpm build
```

## Implementation Order

1. Phase 1 (error formatting) - immediate impact
2. Phase 2 (blame_field) - critical for "Invalid parameter" debugging
3. Phase 3 (budget validation) - improves UX
4. Phase 4 (is_transient) - nice-to-have
