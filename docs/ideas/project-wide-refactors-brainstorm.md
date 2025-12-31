# Refactoring Brainstorm: Project-Wide Analysis

**Generated:** 2025-12-30
**Updated:** 2025-12-31
**Focus Area:** Project-wide refactoring opportunities
**Codebase:** meta-ads-mcp (MCP server for Meta Marketing API)

---

## Completed (PRs #1 + #2)

| ID | Title | PR | Status |
|----|-------|-----|--------|
| REF-001 | Extract tool response helpers | #1 | ✅ Complete |
| REF-003 | Extract account ID normalization utility | #1 | ✅ Complete |
| REF-004 | Centralize constants and enums | #1 | ✅ Complete |
| REF-005 | Extract reusable Zod schema fragments | #2 | ✅ Complete |

**Summary:** Foundational refactoring complete. Established `src/utils/` directory with response helpers, account normalization, constants, and reusable Zod schemas. Code duplication significantly reduced.

---

## Focus Summary

### Purpose
MCP server providing 26 tools for interacting with Meta Marketing API, including OAuth authentication, campaign management, ad operations, and insights retrieval.

### Key Flows
- OAuth authentication flow (login → token exchange → storage)
- API request pipeline (tool → MetaClient → Meta API → response)
- Token management (storage, validation, refresh)
- Error handling with retry logic

### Current Technical Debt Indicators
| Indicator | Severity | Evidence | Status |
|-----------|----------|----------|--------|
| Code Duplication | ~~High~~ Low | ~~25+ identical error handlers, 11 account normalizations~~ → Consolidated via REF-001, REF-003 | ✅ Resolved |
| Large Class | Medium | MetaClient at 587 LOC with 15+ methods | Pending |
| Missing Tests | Critical | 2,272 LOC in tools/ with 0% test coverage | Pending |
| Magic Strings | ~~Medium~~ Low | ~~15+ hardcoded values~~ → Centralized via REF-004 | ✅ Resolved |
| Feature Clones | High | 4 nearly identical insight tools (427 LOC) | Pending |

### Constraints
- Must maintain backward compatibility with existing tool names/schemas
- Meta API rate limits require careful error handling
- Multi-user token isolation must be preserved
- MCP protocol response format requirements

### Risks/Unknowns
- Insights tools refactoring could affect multiple consumers
- MetaClient breakup requires comprehensive test coverage first
- Response format changes could break LLM integrations

---

## Candidate Brainstorm (Unfiltered)

| # | Candidate | Category | Type | Notes |
|---|-----------|----------|------|-------|
| 1 | Extract tool response helpers (success/error) | Conventional | refactor | 25+ duplications |
| 2 | Consolidate 4 insight tools into 1 parametric tool | Creative | refactor | 427→150 LOC |
| 3 | Break MetaClient into domain-specific clients | Moonshot | refactor | 587 LOC class |
| 4 | Centralize constants (objectives, goals, events) | Conventional | refactor | 200+ LOC scattered |
| 5 | Extract account ID normalization utility | Conventional | refactor | 11 occurrences |
| 6 | Add comprehensive tool test coverage | Conventional | testing | 0% → 80% target |
| 7 | Create service layer between tools and client | Creative | refactor | Orchestration abstraction |
| 8 | Extract user ID resolution helper | Conventional | refactor | 25 occurrences |
| 9 | Implement structured error mapping | Conventional | DX | Better error messages |
| 10 | Add request/response logging middleware | Creative | DX | Debugging support |
| 11 | Create tool factory for CRUD operations | Moonshot | refactor | Generate tools programmatically |
| 12 | Extract Zod schema fragments for reuse | Conventional | refactor | user_id schema repeated 25x |
| 13 | Implement response caching layer | Creative | perf | Reduce API calls |
| 14 | Add retry configuration per-endpoint | Conventional | perf | Fine-grained control |
| 15 | Create unified config module | Conventional | refactor | Scattered env vars |
| 16 | Extract date preset validation | Conventional | refactor | 33-value enum duplicated |
| 17 | Implement batch API support | Creative | perf | Reduce round trips |
| 18 | Add OpenAPI spec generation | Moonshot | DX | Auto-documentation |
| 19 | Create mock client for testing | Conventional | testing | Easier tool tests |
| 20 | Extract field validation utilities | Conventional | refactor | Common field patterns |

---

## Top Refactoring Tasks (Ranked)

| # | ID | Title | Cat. | Impact | Effort | Exp. | Risk | Novelty | Priority | Status |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | REF-001 | Extract tool response helpers | Conventional | 5 | 2 | 2 | 1 | 2 | 2.50 | ✅ PR #1 |
| 2 | REF-002 | Consolidate insight tools into parametric tool | Creative | 5 | 3 | 3 | 2 | 4 | 1.67 | Pending |
| 3 | REF-003 | Extract account ID normalization utility | Conventional | 4 | 1 | 1 | 1 | 1 | 4.00 | ✅ PR #1 |
| 4 | REF-004 | Centralize constants and enums | Conventional | 4 | 2 | 2 | 1 | 1 | 2.00 | ✅ PR #1 |
| 5 | REF-005 | Extract reusable Zod schema fragments | Conventional | 4 | 2 | 2 | 1 | 2 | 2.00 | ✅ PR #2 |
| 6 | REF-006 | Create service layer abstraction | Creative | 4 | 3 | 3 | 2 | 3 | 1.33 | Pending |
| 7 | REF-007 | Break MetaClient into domain clients | Moonshot | 5 | 4 | 4 | 3 | 4 | 1.25 | Pending |
| 8 | REF-008 | Add comprehensive tool test suite | Conventional | 5 | 4 | 2 | 1 | 2 | 1.25 | Pending |
| 9 | REF-009 | Implement response caching layer | Creative | 3 | 3 | 3 | 2 | 3 | 1.00 | Pending |
| 10 | REF-010 | Create tool factory for CRUD patterns | Moonshot | 4 | 5 | 4 | 3 | 5 | 0.80 | Pending |

---

## Next Recommended Task: REF-002 (Consolidate Insight Tools)

With the foundational utilities in place (REF-001, REF-003, REF-004, REF-005), the next highest-impact task is REF-002: consolidating the 4 nearly-identical insight tools into a single parametric tool. This would reduce ~427 LOC to ~150 LOC while improving maintainability.

**Prerequisites:** REF-008 (test coverage) is recommended before REF-002 to ensure the consolidation doesn't break existing behavior.

---

## Notes / Assumptions

1. ~~**Test coverage is critical before major refactoring**~~ - REF-007 (MetaClient breakup) and REF-002 (insights consolidation) should wait until REF-008 adds test coverage
2. ~~**Response helper extraction (REF-001) has highest absolute impact**~~ - ✅ **DONE:** 25+ duplications eliminated via `src/utils/response.ts`
3. **Tool factory (REF-010) is high-risk moonshot** - Could eliminate 50%+ of tool code but requires significant design work
4. **Caching (REF-009) needs Meta API rate limit analysis** - Invalidation strategy depends on data freshness requirements
5. **Backward compatibility is paramount** - All refactorings must preserve existing tool names and response schemas
6. ✅ **Foundation established** - `src/utils/` directory now provides: response helpers, account normalization, centralized constants, and reusable Zod schemas
