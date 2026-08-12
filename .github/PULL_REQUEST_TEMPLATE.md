## What this changes

<!-- One or two sentences. What behavior is different after this merges? -->

## Why

<!-- The problem, or the Meta API behavior that made this necessary. -->

## How I verified it

<!-- Commands you ran and what they printed. `pnpm validate` at minimum. -->

- [ ] `pnpm validate` passes locally
- [ ] New or changed tools have tests that assert the request body, not a live response
- [ ] No real Meta app IDs, business IDs, pixel IDs, account IDs, or tokens in the diff
- [ ] If a tool was added or removed, `EXPECTED_TOOL_COUNT` in `scripts/smoke-test.mjs` and the count in `README.md` were both updated
