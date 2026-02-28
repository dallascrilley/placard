# Technical Debt Analysis: meta-ads-mcp

**Date:** 2026-02-28
**Codebase:** ~9,600 lines TypeScript
**Test Coverage:** 81.1% statements
**Tests:** 206 passing

---

## Executive Summary

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Code Coverage | 81.1% | 80%+ | ✅ Met |
| Lint Warnings | 5 | 0 | ⚠️ Needs Work |
| Outdated Dependencies | 7 | 0 | ⚠️ Needs Work |
| Files >500 LOC | 3 | 0 | ⚠️ Needs Work |
| Tests | 206 passing | - | ✅ |

**Overall Debt Score: Low-Medium**

The codebase is well-structured with good test coverage. Primary debt areas are:
1. **Complexity hotspots** in response handling (5 lint warnings)
2. **Code duplication** in tool handlers (22× repeated patterns)
3. **Outdated dependencies** (7 packages behind latest)
4. **Missing integration tests** for OAuth flow

---

## 1. Technical Debt Inventory

### 1.1 Code Complexity Debt (HIGH)

**5 functions exceed complexity threshold (max: 15):**

| File | Function | Complexity | Impact |
|------|----------|------------|--------|
| `tool-responses.ts:129` | `toMarkdown()` | 45 | Error-prone, hard to maintain |
| `tool-responses.ts:418` | `extractErrorInfo()` | 38 | Nested conditionals |
| `tool-responses.ts:507` | `createErrorResponse()` | 25 | Multiple format branches |
| `error-handling.ts:134` | `withRetry()` | 18 | Retry logic complexity |
| `http.ts:18` | HTTP handler | 25 | Route handling |

**Estimated Effort:** 16 hours
**ROI:** Reduces bug surface, improves testability

### 1.2 Code Duplication Debt (MEDIUM)

**Pattern 1: Client instantiation (22 occurrences)**
```typescript
const client = createMetaClient({ userId: user_id ?? "default" });
```
- Found in all 8 tool files
- Same default fallback repeated

**Pattern 2: Format extraction (22 occurrences)**
```typescript
const format = response_format ?? "json";
```
- Every tool handler starts with this

**Pattern 3: Try-catch wrapper**
```typescript
try {
  // tool logic
  return createSuccessResponse({ ... }, format);
} catch (error) {
  return createErrorResponse(error, format);
}
```
- 27 identical error handling blocks

**Estimated Effort:** 8 hours
**ROI:** Reduces maintenance surface by ~200 lines

### 1.3 Dependency Debt (MEDIUM)

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `@modelcontextprotocol/sdk` | 1.25.1 | 1.27.1 | Minor features |
| `@biomejs/biome` | 1.9.4 | 2.4.4 | **Major** - Breaking changes |
| `@types/node` | 22.19.3 | 25.3.3 | **Major** - Node 25 types |
| `better-sqlite3` | 11.10.0 | 12.6.2 | **Major** - Breaking changes |
| `vitest` | 2.1.9 | 4.0.18 | **Major** - Breaking changes |
| `@vitest/coverage-v8` | 2.1.9 | 4.0.18 | **Major** - Breaking changes |
| `zod` | 3.25.76 | 4.3.6 | **Major** - Breaking changes |

**Estimated Effort:** 24 hours (major version upgrades require migration)
**ROI:** Security patches, performance improvements, new features

### 1.4 Large File Debt (LOW)

| File | Lines | Concern |
|------|-------|---------|
| `meta-client.ts` | 716 | Approaching threshold |
| `tool-responses.ts` | 602 | Complexity hotspot |
| `auth.test.ts` | 545 | Test file, acceptable |

**Estimated Effort:** 8 hours
**ROI:** Improved maintainability, faster navigation

### 1.5 Testing Debt (LOW)

**Coverage by Area:**
- API layer: ✅ 80%+ (auth, error-handling, meta-client, token-store)
- Utils: ✅ Good (tool-responses, id-normalizer, schemas)
- Server: ✅ Basic coverage
- Tools: ⚠️ No direct unit tests (covered indirectly)

**Missing Integration Tests:**
- [ ] OAuth full flow (start → callback → token)
- [ ] Cross-restart state persistence
- [ ] HTTP transport mode

**Estimated Effort:** 12 hours
**ROI:** Prevents OAuth regression, documents expected behavior

### 1.6 Architecture Debt (LOW)

**OAuth State Split-Brain (documented in `docs/todo.md`):**
- Callback service and MCP maintain separate OAuth state stores
- Mitigated with recovery flow but not resolved

**Tool Registration Pattern:**
- Each tool file exports `registerXTools(server)` function
- Works but creates tight coupling to server instance

---

## 2. Impact Assessment

### Development Velocity Impact

| Debt Item | Monthly Time Cost | Annual Cost |
|-----------|-------------------|-------------|
| Complexity hotspots | 4 hours debugging | 48 hours |
| Code duplication | 2 hours per change | 24 hours |
| Outdated deps | 1 hour per incident | 12 hours |
| **Total** | **7 hours/month** | **84 hours** |

### Quality Impact

| Debt Item | Bug Risk | Severity |
|-----------|----------|----------|
| `toMarkdown()` complexity | High | Medium |
| Missing OAuth integration tests | Medium | High |
| Dependency lag | Low (currently) | Increases over time |

### Risk Assessment

| Level | Items |
|-------|-------|
| **Critical** | None |
| **High** | OAuth state split-brain (if deploying at scale) |
| **Medium** | Complexity hotspots, dependency updates |
| **Low** | Code duplication, large files |

---

## 3. Prioritized Remediation Plan

### Quick Wins (Week 1-2, 16 hours)

| # | Task | Effort | ROI |
|---|------|--------|-----|
| 1 | Extract tool handler wrapper | 4h | Eliminates 22× duplication |
| 2 | Split `toMarkdown()` into composable functions | 4h | Complexity 45→15 |
| 3 | Split `extractErrorInfo()` into type guards | 4h | Complexity 38→12 |
| 4 | Update `@modelcontextprotocol/sdk` to 1.27.1 | 2h | Minor, safe |
| 5 | Add OAuth integration test scaffolding | 2h | Documents flow |

**Implementation: Tool Handler Wrapper**
```typescript
// src/utils/tool-handler.ts
export function withToolHandler<T extends Record<string, unknown>>(
  handler: (params: T, client: MetaClient, format: ResponseFormat) => Promise<ToolResponse>
): (params: T & { user_id?: string; response_format?: ResponseFormat }) => Promise<ToolResponse> {
  return async (params) => {
    const format = params.response_format ?? "json";
    const client = createMetaClient({ userId: params.user_id ?? "default" });
    try {
      return await handler(params, client, format);
    } catch (error) {
      return createErrorResponse(error, format);
    }
  };
}
```

### Medium-Term (Month 1-2, 24 hours)

| # | Task | Effort | ROI |
|---|------|--------|-----|
| 1 | Refactor `createErrorResponse()` | 4h | Complexity 25→12 |
| 2 | Split `meta-client.ts` by entity | 8h | Better organization |
| 3 | Add tool-level unit tests | 8h | Coverage completeness |
| 4 | Update biome 1.9→2.x | 4h | Modern lint rules |

### Long-Term (Quarter 2, 40 hours)

| # | Task | Effort | ROI |
|---|------|--------|-----|
| 1 | Major dependency upgrades (zod 4, vitest 4) | 16h | Security, features |
| 2 | Resolve OAuth state split-brain | 12h | Production readiness |
| 3 | Add E2E test suite with real API (sandbox) | 12h | Confidence |

---

## 4. Prevention Strategy

### Automated Quality Gates

```json
// biome.json additions
{
  "linter": {
    "rules": {
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "error",
          "options": { "maxAllowedComplexity": 15 }
        }
      }
    }
  }
}
```

### Pre-commit Hooks
```yaml
# Suggested additions
- pnpm lint  # Already configured
- pnpm test  # Already configured
- pnpm outdated --long  # Flag major version lag
```

### Debt Budget
- **Allowed monthly complexity increase:** 2 warnings max
- **Mandatory quarterly reduction:** 1 warning per quarter
- **Dependency lag limit:** No more than 2 major versions behind

---

## 5. Metrics Dashboard

### Current State (2026-02-28)

```yaml
code_quality:
  cognitive_complexity:
    files_above_threshold: 3
    total_violations: 5
    target: 0

  code_duplication:
    pattern_occurrences: 22
    estimated_lines: ~200
    target: <5% duplication

test_coverage:
  statements: 81.1%
  branches: 75%  # estimated
  target: 80% / 75%

dependency_health:
  outdated_major: 5
  outdated_minor: 2
  security_vulnerabilities: 0
  target: 0 / 0 / 0

codebase_size:
  total_lines: 9623
  production_lines: ~4000
  test_lines: ~2900
  files_over_500_loc: 3
```

### Target State (Q2 2026)

```yaml
code_quality:
  cognitive_complexity:
    files_above_threshold: 0
    total_violations: 0

  code_duplication:
    pattern_occurrences: <5

test_coverage:
  statements: 85%
  branches: 80%

dependency_health:
  outdated_major: 0
  outdated_minor: <3
```

---

## 6. Implementation Roadmap

```
Week 1-2 (Quick Wins)
├── [ ] Extract withToolHandler wrapper
├── [ ] Refactor toMarkdown → composable functions
├── [ ] Refactor extractErrorInfo → type guards
├── [ ] Update @modelcontextprotocol/sdk 1.27.1
└── [ ] Add OAuth integration test scaffolding

Month 1-2
├── [ ] Refactor createErrorResponse
├── [ ] Split meta-client.ts by entity
├── [ ] Add tool-level unit tests
└── [ ] Update biome to 2.x

Quarter 2
├── [ ] Major dep upgrades (zod 4, vitest 4)
├── [ ] Resolve OAuth state architecture
└── [ ] E2E test suite with sandbox API
```

---

## 7. Summary

**Strengths:**
- Good test coverage (81.1%)
- Clean separation of concerns (API, tools, schemas)
- Consistent patterns across tool implementations
- Good documentation in `docs/todo.md`

**Priorities:**
1. **Immediate:** Reduce complexity in `tool-responses.ts` (5 warnings → 0)
2. **Short-term:** Extract tool handler wrapper to eliminate duplication
3. **Medium-term:** Update dependencies to close security/feature gap

**Estimated Total Investment:** 80 hours over 3 months
**Expected ROI:** 84 hours/year saved + reduced bug rate + improved DX

---

*Generated by technical debt analysis on 2026-02-28*
