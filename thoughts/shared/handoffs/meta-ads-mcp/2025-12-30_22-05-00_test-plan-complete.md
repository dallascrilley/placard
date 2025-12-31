---
created: 2025-12-30T22:05:00Z
session_id: meta-ads-mcp-testing
root_span_id: unknown
---

# Handoff: MCP Test Suite Design Complete

## Summary

Designed a comprehensive test plan for the meta-ads-mcp server covering unit tests (API layer), integration tests (tool functions), and server registration tests. Plan is documented and approved, ready for implementation.

## Current State

### Completed
- Full codebase exploration and documentation
- Test plan created at `/Users/dallascrilley/.claude/plans/jolly-spinning-scone.md`
- Three-layer testing strategy designed (unit, integration, server)
- Mock strategy defined (fetch API, database, auth)
- Directory structure proposed
- Priority tiers identified (high/medium/low)

### Ready for Implementation
- Vitest 2.1.0 already installed (not yet configured)
- Test framework choice confirmed
- File structure mapped

### Pending User Decisions
- Coverage target percentage (suggested: 80%)
- Mock depth preference
- CI/CD integration requirements

## Files Changed

This session was primarily planning - no code files changed.

### Plan File Created
- `/Users/dallascrilley/.claude/plans/jolly-spinning-scone.md` - Full test design plan

### Previous Handoff
- `thoughts/shared/handoffs/meta-ads-mcp/2025-12-30_21-42-00_implementation-complete.md` - Implementation details

## Next Steps

1. **Set up Vitest Configuration**
   - Create `vitest.config.ts` with TypeScript support
   - Configure coverage reporting
   - Set test file patterns: `**/*.test.ts`

2. **Create Test Utilities**
   - Mock fetch helper in `src/__tests__/utils/mock-fetch.ts`
   - Mock Meta API response builders
   - Test token factory for token-store tests
   - Mock MetaClient factory

3. **Implement Unit Tests (Priority Order)**
   - `src/__tests__/api/error-handling.test.ts` - Error classification, retry logic
   - `src/__tests__/api/token-store.test.ts` - CRUD, expiration, multi-user
   - `src/__tests__/api/meta-client.test.ts` - HTTP behavior
   - `src/__tests__/api/auth.test.ts` - OAuth flow

4. **Implement Tool Tests**
   - `src/__tests__/tools/accounts.test.ts` - Parameter normalization
   - `src/__tests__/tools/campaigns.test.ts` - CRUD operations
   - Representative samples from other tools

5. **Implement Server Tests**
   - `src/__tests__/server.test.ts` - Tool registration verification

## Context

### Test Strategy Summary
```
Layer 1: Unit Tests (API)
├── error-handling.ts - Error codes, retryability, backoff
├── token-store.ts - SQLite CRUD, expiration
├── meta-client.ts - HTTP requests, parameters
└── auth.ts - OAuth state, token exchange

Layer 2: Integration Tests (Tools)
├── Zod schema validation
├── Parameter normalization (act_ prefix)
├── Response format (success/error JSON)
└── Error propagation

Layer 3: Server Tests
├── All 22 tools registered
├── Health check works
└── Server initializes without errors
```

### Mock Strategy
- **Fetch**: Mock global fetch to simulate Meta API responses
- **Timers**: Mock for testing retry delays without waiting
- **Database**: Use temporary SQLite files (realistic) or mock better-sqlite3 (isolated)
- **Auth**: Mock MetaAuth with fixed tokens

### Files to Test (by priority)
**High Priority:**
- `src/api/error-handling.ts` (~199 lines) - Core retry logic
- `src/api/token-store.ts` (~148 lines) - Token persistence
- `src/api/meta-client.ts` (~588 lines) - API client

**Medium Priority:**
- `src/api/auth.ts` (~323 lines) - OAuth flow
- `src/tools/campaigns.ts` (~367 lines) - Representative tool

**Lower Priority:**
- Other tools (similar patterns)
- Server registration

### Key Testing Patterns
```typescript
// Mock fetch for API tests
vi.mock('node:fetch', () => ({
  default: vi.fn()
}));

// Test error retryability
expect(new MetaApiError({ error: { code: 4, ... } }).isRetryable).toBe(true);

// Test account_id normalization
expect(normalizeAccountId("123")).toBe("act_123");
expect(normalizeAccountId("act_123")).toBe("act_123");

// Test token expiration (5-min buffer)
const token = { expiresAt: nowSeconds + 300 }; // exactly 5 min
expect(store.getValidToken(userId)).toBeNull();
```

### Success Criteria
- All unit tests for API layer pass
- Tool validation tests catch invalid inputs
- Error handling tests confirm retryability logic
- Token management tests verify expiration and cleanup
- Server registration tests confirm all 22 tools available
- At least 80% code coverage of src/api and src/tools directories
