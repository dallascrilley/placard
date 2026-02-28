# Meta Ads MCP Brainstorm — 2026-02-28

## Focus Summary

The Meta Ads MCP server provides a read-only wrapper around the Meta Marketing API, enabling AI agents to query campaign performance, creative content, and audience targeting. Currently, it supports core operations across accounts, campaigns, adsets, ads, and insights. However, the system faces friction in deep historical data access (pagination), inefficient filtering workflows (multi-call requirements), and oversized response payloads that exceed MCP limits. The goal of this brainstorm is to propose high-impact features that solve these friction points and unlock advanced analytical capabilities for agents.

- **Purpose**: Bridge the gap between AI agents and the complex Meta Ads API.
- **Key Flows**: Performance auditing, creative analysis, budget monitoring, audience research.
- **Constraints**: Read-only access (no campaign modification yet), MCP response size limits (256KB-512KB typical).
- **Risks/Unknowns**: API rate limits for complex aggregations, privacy restrictions on lead data, variations in creative formats (dynamic vs. standard).

---

## Candidate Brainstorm (Unfiltered)

1. **FEAT-001: Deep Search Pagination & Campaign Filtering** (Solves P0 friction: add `after` cursors and `campaign_id` filters for ads).
2. **FEAT-002: Creative Content Expansion & Power-User Fields** (Add `asset_feed_spec` and inline creative content in ad details).
3. **FEAT-003: Visual Ad Preview & Shareable Link Generator** (Novelty: generate real ad preview links for visual audit).
4. **FEAT-004: Creative Asset Pivot & ROI Matrix** (Creative: Connect image/video assets to performance ROI in one tool).
5. **FEAT-005: Ad Set Delivery Diagnostics & Auction Debugger** (Creative: explain *why* ads aren't running).
6. **FEAT-006: Historical Campaign Flight Path & Budget Timeline** (Analyze past changes vs performance).
7. **FEAT-007: Unified Cross-Account Strategic Dashboard** (Moonshot: Single tool for multi-account agencies).
8. **FEAT-008: Campaign Blueprint Export/Import (JSON)** (Moonshot: Export successful structures for reuse).
9. **FEAT-009: Sentiment & Policy Pre-Flight Auditor** (Creative: Pull all copy for policy risk analysis).
10. **FEAT-010: Lead Generation Form Data Explorer** (Unlock new workflow: lead data retrieval).
11. **FEAT-011: Audience Overlap & Competition Analyzer** (Detect internal bidding wars).
12. **FEAT-012: Adaptive Response Size Management** (Auto-summarize heavy fields when approaching MCP limits).
13. **FEAT-013: Account Health "Quick Score"** (Aggregate insights into a single readiness score).
14. **FEAT-014: Predictive CPA Forecasting** (Forecast next 30 days based on history).
15. **FEAT-015: Competitive Benchmarking (if available via API)** (Compare against industry averages).
16. **FEAT-016: Ad Copy Variation Generator Context** (Tool to pull top 5 copy variants with performance to help AI generate new ones).
17. **FEAT-017: Campaign Reach & Frequency Estimator** (Predict future reach based on current spend).
18. **FEAT-018: OAuth State Mismatch Auto-Repair** (Improve login UX).
19. **FEAT-019: Ad Set Bid Strategy History** (Analyze how bid strategies changed over time).
20. **FEAT-020: Pixel Attribution Reliability Checker** (Audit if pixel events are firing correctly).

---

## Top Features (Ranked)

| # | ID | Title | Cat. | Impact | Effort | Exp. | Risk | Novelty | Priority | Targets / Search |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | FEAT-001 | Deep Search Pagination & Filtering | Conventional | 5 | 1 | 2 | 1 | 2 | 5.0 | `meta_get_ads`, `pagination` |
| 2 | FEAT-002 | Creative Expansion & Power Fields | Conventional | 4 | 1 | 2 | 1 | 2 | 4.0 | `get_ad_details`, `fields` |
| 3 | FEAT-003 | Ad Preview Link Generator | Creative | 3 | 2 | 3 | 2 | 4 | 1.5 | `meta_get_ad_preview` |
| 4 | FEAT-004 | Creative Performance Pivot Matrix | Creative | 4 | 3 | 3 | 2 | 4 | 1.33 | `meta_get_creative_roi` |
| 5 | FEAT-005 | Ad Set Delivery & Auction Debugger | Creative | 5 | 4 | 4 | 3 | 3 | 1.25 | `meta_get_delivery_status` |
| 6 | FEAT-006 | Campaign History & Budget Timeline | Conventional | 3 | 2 | 2 | 1 | 2 | 1.5 | `meta_get_campaign_history` |
| 7 | FEAT-007 | Unified Cross-Account Strategic Dashboard | Moonshot | 5 | 4 | 4 | 3 | 3 | 1.25 | `meta_get_multi_account_view` |
| 8 | FEAT-008 | Campaign Blueprint Export (JSON) | Moonshot | 3 | 5 | 4 | 3 | 4 | 0.6 | `meta_export_campaign` |

---

## Rationale for #1

FEAT-001 (Deep Search Pagination & Filtering) is the single highest-leverage improvement because it addresses critical P0 blockers identified in real agent usage. Without cursor-based pagination and campaign-level filtering for ads, agents are physically blocked from auditing historical data or forced into inefficient, multi-call workarounds that rapidly deplete rate limits.

---

## Epics

### EPIC-01: Deep Data Accessibility (The "Frictionless" Foundation)
*Organized by User Journey: Data Retrieval*
- **FEAT-001**: Deep Search Pagination & Filtering (Parent: EPIC-01)
- **FEAT-002**: Creative Expansion & Power Fields (Parent: EPIC-01)

### EPIC-02: Creative Intelligence & Visuals
*Organized by Value Theme: Creative Audit*
- **FEAT-003**: Ad Preview Link Generator (Parent: EPIC-02)
- **FEAT-004**: Creative Performance Pivot Matrix (Parent: EPIC-02)

### EPIC-03: Advanced Performance Diagnostics
*Organized by Problem Domain: Delivery Issues*
- **FEAT-005**: Ad Set Delivery & Auction Debugger (Parent: EPIC-03)
- **FEAT-006**: Campaign History & Budget Timeline (Parent: EPIC-03)

### EPIC-04: Multi-Account & Strategy Scale
*Organized by Technical Capability: Aggregation & Portability*
- **FEAT-007**: Unified Cross-Account Strategic Dashboard (Parent: EPIC-04)
- **FEAT-008**: Campaign Blueprint Export (JSON) (Parent: EPIC-04)

---

## Feature Details

### FEAT-001: Deep Search Pagination & Filtering
- **User Value**: Unblocks access to years of historical data and allows surgically precise filtering of ads without fetching entire ad sets.
- **Scope**: Add `after` cursor support to all list tools; add `campaign_id` filter to `meta_get_ads`.
- **Steps**:
  1. Update `pagingSchema` in `src/schemas/common.ts` to include `after` and `before`.
  2. Wire `after` parameter into `MetaClient` list methods.
  3. Update `meta_get_ads` tool definition to accept `campaign_id`.
  4. Implement `getCampaignAds` filtering logic in the client.
- **Acceptance Criteria**:
  - [ ] `meta_get_campaigns` returns `paging.cursors.after` and accepts it in the next call.
  - [ ] `meta_get_ads` returns only ads for a specific `campaign_id` when provided.
- **Test Plan**: Integration tests in `src/__tests__/api/meta-client.test.ts` verifying cursor usage and filter parameters.

### FEAT-003: Ad Preview Link Generator
- **Category**: Creative
- **Experiment Category**: creative
- **Small Experiment**: 1 hour - manually call `/ad_id/previews` via Postman to verify `preview_shareable_link` lifetime and accessibility.
- **Success Metric**: Link is accessible in a browser without Meta login for at least 24 hours.
- **Rollback Plan**: Remove the tool; it's a standalone endpoint with no side effects.
- **User Value**: Allows agents to "see" the ad exactly as it appears on Facebook/Instagram, enabling visual quality checks.
- **Scope**: New tool `meta_get_ad_preview` that returns a shareable preview URL.
- **Steps**:
  1. Add `getAdPreview` method to `MetaClient`.
  2. Create `src/tools/previews.ts`.
  3. Register tool with `ad_id` and `ad_format` parameters.
- **Acceptance Criteria**:
  - [ ] Tool returns a valid URL starting with `https://www.facebook.com/ads/ad_preview/`.
- **Test Plan**: Unit test verifying the API URL construction and response parsing.

### FEAT-005: Ad Set Delivery & Auction Debugger
- **Category**: Creative
- **Experiment Category**: creative
- **Small Experiment**: 2 hours - Map `delivery_info` field codes from Meta API documentation to human-readable strings.
- **Success Metric**: Agent can correctly identify a "Learning Phase" or "Auction Overlap" status from a sample API response.
- **Rollback Plan**: Revert tool; read-only diagnostics have zero system impact.
- **User Value**: Solves the most common user frustration: "I turned my ad on but I don't see any impressions."
- **Scope**: Tool that fetches `delivery_info` and `adset_schedule` to diagnose delivery blocks.
- **Steps**:
  1. Implement `getDeliveryDiagnostics` in `MetaClient` using the `delivery_info` field.
  2. Add diagnostic logic to explain common codes (e.g., `IN_LEARNING`, `AUCTION_OVERLAP`, `DAILY_BUDGET_EXHAUSTED`).
  3. Expose as `meta_get_delivery_diagnostics`.
- **Acceptance Criteria**:
  - [ ] Tool provides a `status_explanation` field for non-active ad sets.
- **Test Plan**: Mock API responses with various delivery codes and verify the "human-readable" explanation mapping.

### FEAT-007: Unified Cross-Account Strategic Dashboard
- **Category**: Moonshot
- **Experiment Category**: moonshot
- **Small Experiment**: 2 hours - Attempt to call `getInsights` for 3 different `act_` IDs in parallel and measure total latency.
- **Success Metric**: Response time < 5 seconds for up to 5 accounts.
- **Rollback Plan**: Deprecate the tool; no changes to existing account-level tools.
- **User Value**: Provides a high-level "Command Center" view for agents managing multi-account brands or agencies.
- **Scope**: Tool that aggregates key performance metrics (spend, ROI, impressions) across multiple authorized accounts.
- **Steps**:
  1. Create `meta_get_multi_account_summary` tool.
  2. Implement parallel account fetching with error handling for individual account failures.
  3. Aggregate metrics into a single weighted average/total dashboard.
- **Acceptance Criteria**:
  - [ ] Returns a list of account summaries with a global total.
  - [ ] Gracefully handles one account being unauthorized while others succeed.
- **Test Plan**: Parallel execution tests in `src/__tests__/tools/composite.test.ts`.

---

## Notes / Assumptions

- Assumes the Meta Marketing API version `v19.0` or higher is in use.
- Assumes the current `token-store.ts` can handle tokens for multiple accounts if the underlying Facebook User has access to them.
- Assumes the MCP client (e.g., Claude Code) can handle response payloads up to 512KB before requiring file-based redirection.
