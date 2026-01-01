# MCP Best Practices Audit

**Generated:** 2025-12-31
**Codebase:** meta-ads-mcp
**Audited Against:** MCP Builder Skill Reference (v1.0)

---

## Executive Summary

| Category | Score | Status |
|----------|-------|--------|
| Project Structure | 9/10 | ✅ Excellent |
| Tool Naming | 6/10 | ⚠️ Needs Improvement |
| Schema Validation | 8/10 | ✅ Good |
| Error Handling | 9/10 | ✅ Excellent |
| Tool Descriptions | 4/10 | ❌ Major Gap |
| Tool Annotations | 0/10 | ❌ Missing |
| Pagination | 6/10 | ⚠️ Partial |
| Response Formats | 4/10 | ❌ Missing |
| Code Reusability | 9/10 | ✅ Excellent |

**Overall Score: 61/100**

---

## Detailed Findings

### 1. Project Structure ✅ (9/10)

**What's Good:**
- Clean separation: `src/tools/`, `src/api/`, `src/schemas/`, `src/utils/`, `src/constants/`
- Follows recommended Node/TypeScript structure
- TypeScript with strict mode (`"strict": true`)
- Proper package.json with ESM modules (`"type": "module"`)
- Build outputs to `dist/`

**Issues:**
- Package name `meta-ads-mcp` should be `meta-ads-mcp-server` per naming convention

**Recommendation:**
```json
// package.json
"name": "meta-ads-mcp-server"
```

---

### 2. Tool Naming ⚠️ (6/10)

**What's Good:**
- Uses snake_case (e.g., `get_campaigns`, `create_ad`)
- Action-oriented verbs (get, create, update)

**Issues:**
- **Missing service prefix**: Tools should use `meta_` prefix to avoid conflicts with other MCP servers
- Current: `get_campaigns`
- Should be: `meta_get_campaigns` or `meta_ads_get_campaigns`

**Current Tools (27 total):**
| Current Name | Recommended Name |
|--------------|------------------|
| `meta_get_login_link` | `meta_get_login_link` |
| `meta_complete_auth` | `meta_complete_auth` |
| `meta_check_auth_status` | `meta_check_auth_status` |
| `meta_logout` | `meta_logout` |
| `get_ad_accounts` | `meta_get_ad_accounts` |
| `get_account_info` | `meta_get_account_info` |
| `get_campaigns` | `meta_get_campaigns` |
| `get_campaign_details` | `meta_get_campaign_details` |
| `create_campaign` | `meta_create_campaign` |
| `update_campaign` | `meta_update_campaign` |
| `get_adsets` | `meta_get_adsets` |
| `get_adset_details` | `meta_get_adset_details` |
| `create_adset` | `meta_create_adset` |
| `update_adset` | `meta_update_adset` |
| `get_ads` | `meta_get_ads` |
| `get_ad_details` | `meta_get_ad_details` |
| `create_ad` | `meta_create_ad` |
| `update_ad` | `meta_update_ad` |
| `get_ad_creatives` | `meta_get_ad_creatives` |
| `create_ad_creative` | `meta_create_ad_creative` |
| `search_targeting` | `meta_search_targeting` |
| `get_reach_estimate` | `meta_get_reach_estimate` |
| `get_account_insights` | `meta_get_account_insights` |
| `get_campaign_insights` | `meta_get_campaign_insights` |
| `get_adset_insights` | `meta_get_adset_insights` |
| `get_ad_insights` | `meta_get_ad_insights` |
| `health_check` | `meta_health_check` |

---

### 3. Schema Validation ✅ (8/10)

**What's Good:**
- Zod schemas with proper constraints (.min(), .max(), .int(), .positive())
- Reusable schema fragments in `src/schemas/common.ts`
- Type inference using `z.infer<>`
- Good `.describe()` usage on fields
- Constants extracted for enums (DATE_PRESETS, BREAKDOWNS, etc.)

**Issues:**
- Missing `.strict()` on schema objects (allows extra fields)
- Some schemas lack min/max constraints

**Example Fix:**
```typescript
// Current
const UserSearchInputSchema = z.object({
  query: z.string(),
  // ...
});

// Recommended
const UserSearchInputSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(200, "Query must not exceed 200 characters"),
  // ...
}).strict();
```

---

### 4. Error Handling ✅ (9/10)

**What's Good:**
- Structured error classes: `MetaApiError`, `AuthenticationError`, `RateLimitError`
- Retry logic with exponential backoff + jitter (`withRetry`)
- Error categorization (retryable vs non-retryable)
- Consistent error response format via `createErrorResponse()`
- Proper error codes mapped (rate limits, auth, permissions)

**Issues:**
- Error messages could be more actionable (e.g., "Rate limit exceeded. Wait 60 seconds then retry.")

---

### 5. Tool Descriptions ❌ (4/10)

**What's Good:**
- All tools have basic descriptions

**Issues:**
- **Descriptions are too short** - should include:
  - Full parameter documentation
  - Return schema documentation
  - Usage examples
  - Error conditions

**Current Example:**
```typescript
server.tool(
  "get_campaigns",
  "List campaigns for an ad account with optional filtering",
  { ... }
)
```

**Recommended Format:**
```typescript
server.tool(
  "meta_get_campaigns",
  `List campaigns for an ad account with optional filtering.

This tool retrieves all advertising campaigns from a Meta ad account,
supporting status filtering and pagination. It returns campaign details
including budgets, objectives, and scheduling information.

Args:
  - account_id (string): Ad account ID (with or without 'act_' prefix)
  - limit (number): Maximum campaigns to return, 1-100 (default: 25)
  - status (string): Filter by status: ACTIVE, PAUSED, DELETED, ARCHIVED
  - user_id (string): User ID for multi-user auth (default: 'default')

Returns (JSON):
  {
    "success": true,
    "campaigns": [
      {
        "id": "23456789",
        "name": "Campaign Name",
        "objective": "OUTCOME_AWARENESS",
        "status": "ACTIVE",
        "daily_budget": 1000,
        ...
      }
    ],
    "paging": { "cursors": {...}, "next": "..." }
  }

Examples:
  - Get active campaigns: { account_id: "act_123", status: "ACTIVE" }
  - Get all with limit: { account_id: "act_123", limit: 50 }

Error Handling:
  - 190: Token expired - use get_login_link to re-authenticate
  - 4/17/32: Rate limited - wait and retry`,
  { ... }
)
```

---

### 6. Tool Annotations ❌ (0/10)

**Issue:** No tools have annotations defined.

**Impact:** Clients cannot understand tool behavior:
- Read-only vs destructive
- Idempotent vs not
- External vs local

**Recommendation:** Add annotations to ALL tools:

```typescript
// Read-only tool (get_campaigns, get_ad_accounts, etc.)
server.tool(
  "meta_get_campaigns",
  { ... },
  {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params) => { ... }
)

// Mutating tool (create_campaign, update_campaign, etc.)
server.tool(
  "meta_create_campaign",
  { ... },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,  // Creates new, doesn't destroy
      idempotentHint: false,   // Creates new each time
      openWorldHint: true
    }
  },
  async (params) => { ... }
)
```

**Annotation Guide:**

| Tool Pattern | readOnlyHint | destructiveHint | idempotentHint |
|--------------|--------------|-----------------|----------------|
| `get_*`, `search_*` | true | false | true |
| `create_*` | false | false | false |
| `update_*` | false | false | true |
| `delete_*` | false | true | true |
| `logout` | false | false | true |

---

### 7. Pagination ⚠️ (6/10)

**What's Good:**
- `limit` parameter on list operations
- Consistent default (25)
- Returns `paging` object from Meta API

**Issues:**
- No `offset` parameter exposed
- Missing pagination metadata in response (`has_more`, `next_offset`, `total_count`)
- No cursor-based pagination support exposed

**Current Response:**
```json
{
  "success": true,
  "campaigns": [...],
  "paging": { "cursors": {...} }
}
```

**Recommended Response:**
```json
{
  "success": true,
  "total": 150,
  "count": 25,
  "offset": 0,
  "campaigns": [...],
  "has_more": true,
  "next_cursor": "abc123"
}
```

---

### 8. Response Formats ❌ (4/10)

**What's Good:**
- Consistent JSON response structure via `createSuccessResponse()`
- `success: true/false` indicator

**Issues:**
- **No Markdown format support** - best practice is dual format
- No `response_format` parameter
- No `structuredContent` in responses (modern SDK feature)

**Recommendation:** Add response format parameter:

```typescript
const ResponseFormat = z.enum(["json", "markdown"]).default("json");

// In tool schema
response_format: ResponseFormat.describe(
  "Output format: 'json' for machine-readable or 'markdown' for human-readable"
)

// In handler
if (params.response_format === "markdown") {
  return {
    content: [{ type: "text", text: formatAsMarkdown(data) }]
  };
} else {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data  // Modern SDK feature
  };
}
```

---

### 9. Code Reusability ✅ (9/10)

**What's Good:**
- Extracted utilities:
  - `createSuccessResponse()` / `createErrorResponse()` - eliminates 26 duplications
  - `normalizeAccountId()` - eliminates 11 duplications
  - Centralized constants (DATE_PRESETS, OBJECTIVES, etc.)
  - Reusable Zod schemas (userIdSchema, accountIdSchema, etc.)
- Shared MetaClient for all API operations
- Consistent error handling via `withRetry()`

**Issues:**
- Insight tools (4) have similar structure - could be consolidated (noted in REF-002)

---

## Priority Recommendations

### High Priority (Breaking for LLM usability)

1. **Add Tool Annotations** - 0% coverage → 100%
   - Effort: 2-3 hours
   - Impact: Clients can understand tool behavior

2. **Improve Tool Descriptions** - Short → Comprehensive
   - Effort: 4-6 hours
   - Impact: LLMs can select correct tools

3. **Add Service Prefix to Tools** - `get_campaigns` → `meta_get_campaigns`
   - Effort: 1-2 hours
   - Impact: Avoid conflicts when used with other MCP servers

### Medium Priority (Best Practice Compliance)

4. **Add Response Format Support** (JSON/Markdown)
   - Effort: 3-4 hours
   - Impact: Human readability for debugging

5. **Improve Pagination Metadata**
   - Effort: 2 hours
   - Impact: LLMs can navigate large datasets

6. **Add `.strict()` to Zod Schemas**
   - Effort: 30 minutes
   - Impact: Reject malformed requests

### Low Priority (Polish)

7. **Rename package to `meta-ads-mcp-server`**
   - Effort: 10 minutes
   - Impact: Convention compliance

8. **Add `structuredContent` to responses**
   - Effort: 1 hour
   - Impact: Modern SDK compatibility

---

## Compliance Checklist

### Strategic Design
- [ ] Tools enable complete workflows ✅
- [ ] Tool names reflect natural task subdivisions ✅
- [x] Response formats optimize for agent context efficiency ⚠️ (JSON only)
- [x] Human-readable identifiers used ✅
- [ ] Error messages guide agents toward correct usage ⚠️ (could be more actionable)

### Implementation Quality
- [x] Most important tools implemented ✅
- [ ] All tools registered with complete configuration ❌ (missing annotations)
- [x] All tools include title, description, inputSchema ⚠️ (descriptions too short)
- [ ] Annotations correctly set ❌ (0% coverage)
- [x] Zod schemas with .strict() ❌ (not used)
- [x] Comprehensive descriptions with I/O types ❌
- [x] Error messages clear and actionable ⚠️

### TypeScript Quality
- [x] Interfaces defined for data structures ✅
- [x] Strict TypeScript enabled ✅
- [x] No `any` type ✅
- [x] Async functions with Promise<T> return types ✅
- [x] Error handling with type guards ✅

### Code Quality
- [x] Pagination implemented ⚠️ (partial)
- [ ] CHARACTER_LIMIT constant for truncation ❌
- [x] Filtering options provided ✅
- [x] Timeout and error handling ✅
- [x] Common functionality extracted ✅

---

## Next Steps

1. **Create REF-011: Add Tool Annotations** (High priority, 2-3 hours)
2. **Create REF-012: Improve Tool Descriptions** (High priority, 4-6 hours)
3. **Create REF-013: Add Service Prefix to Tools** (High priority, 1-2 hours)
4. **Create REF-014: Add Response Format Support** (Medium priority, 3-4 hours)
