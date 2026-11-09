---
name: trissea-code-review
description: Review TRISSEA diffs, pull requests and proposed changes for correctness, security, regressions, API/DB compatibility, race conditions, maintainability and test evidence. Use for code review, pre-merge audit or acceptance review; do not use merely to summarize a document.
---

# Practical code review

## Inputs and context

Inspect relevant diff/PR and changed-file list; read nearby callers, tests, exact acceptance criteria, architecture/ADRs and changed data contracts. Do not assume the PR description is proof of actual execution. Preserve author changes; do not modify code unless requested.

## Review order

1. **Correctness:** does code fulfill the behavior, all state transitions and expected failures? Look for broken callers, null paths and unexpected side effects.
2. **Security and authorization:** role/scope checks, PII/secret exposure, bypasses, provider trust boundaries, input validation, session and rate controls.
3. **Data integrity:** migrations and backfills, constraint gaps, duplicated operations, race windows, stale-read decisions, transaction/audit/outbox consistency and compatibility with existing data.
4. **Maintainability:** unnecessary abstraction, duplicated logic, brittle special cases, unverified dependencies, dead code, naming, layering, error semantics and rollout flags.
5. **Tests and operations:** behavioral assertions, failure modes, logs/metrics, compatibility across Windows/Linux, emulator limits, rollback/repair path and production gates.

## Findings format

Report actionable findings by severity (blocker/high/medium/low), each with file:line when available, a concrete failure scenario, why it matters and smallest credible fix. Avoid speculative warnings unsupported by code. Separate unresolved questions from confirmed defects. State residual risks and tests absent. If no issues are found, say what was reviewed and its limitations; do not claim the implementation is perfect.
