# Lessons Learned

## 2026-02-28 - MCP audit correction workflow
- When user-provided audit/handoff reports missing MCP parameters, fix all three layers together: tool schema/docstring, handler passthrough, and API client request body.
- For create endpoints that support alternate spec formats, enforce explicit one-of validation in the tool layer to prevent silent partial payloads.
- Add regression coverage for both validator logic and request payload shape so dropped optional fields fail tests immediately.

## 2026-03-01 - Provider defaults and CTA guardrails
- Do not rely on Meta implicit defaults for bid strategy; set `LOWEST_COST_WITHOUT_CAP` explicitly on campaign creation unless caller overrides.
- Add preflight validation for known-invalid CTA enums in flexible object payloads (e.g., reject `GET_TICKETS` for `object_story_spec` and suggest `BUY_TICKETS`).
