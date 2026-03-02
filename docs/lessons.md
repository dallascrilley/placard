# Lessons Learned

## 2026-02-28 - MCP audit correction workflow
- When user-provided audit/handoff reports missing MCP parameters, fix all three layers together: tool schema/docstring, handler passthrough, and API client request body.
- For create endpoints that support alternate spec formats, enforce explicit one-of validation in the tool layer to prevent silent partial payloads.
- Add regression coverage for both validator logic and request payload shape so dropped optional fields fail tests immediately.

## 2026-03-01 - Provider defaults and CTA guardrails
- Do not rely on Meta implicit defaults for bid strategy; set `LOWEST_COST_WITHOUT_CAP` explicitly on campaign creation unless caller overrides.
- Add preflight validation for known-invalid CTA enums in flexible object payloads (e.g., reject `GET_TICKETS` for `object_story_spec` and suggest `BUY_TICKETS`).

## 2026-03-01 - Duplicate/compare tool patterns
- Review feedback: when source payload fields can be polymorphic (`string | string[]`), normalize with explicit type guards instead of direct casts.
- Review feedback: fallback-generated resource names should include uniqueness suffixes to avoid operational collisions in repeated clone workflows.
- Prevention rule: add a regression test whenever duplication logic depends on optional upstream fields (`name`, `pacing_type`, `summary.total_count`).

## 2026-03-01 - Research-first when requested
- When the user asks for external guidance before implementation, pause code changes and run primary-source research first (Meta docs via Context7), then encode the resulting constraints into defaults/config knobs.
- Treat typed error classes as primary signals (e.g., `RateLimitError`) and keep numeric code lists as secondary fallbacks so unmapped provider codes still trigger safety behavior.
- Parse numeric env config defensively; invalid or empty values must fall back to safe defaults rather than propagating `NaN` into control flow.
