# Lessons

## 2026-03-01
- Review feedback: when source payload fields can be polymorphic (`string | string[]`), normalize with explicit type guards instead of direct casts.
- Review feedback: fallback-generated resource names should include uniqueness suffixes to avoid operational collisions in repeated clone workflows.
- Prevention rule: add a regression test whenever duplication logic depends on optional upstream fields (`name`, `pacing_type`, `summary.total_count`).
