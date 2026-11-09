---
name: trissea-engineering-workflow
description: "Execute TRISSEA coding sessions for nontrivial features, bugs and refactors: inspect implementation, diagnose root cause, plan narrowly, make focused edits, test and hand off verifiable results. Use for programming work across backend, mobile, admin or workers; skip for trivial read-only questions."
---

# Engineering workflow — perform the work, prove the result

Follow `AGENTS.md`, the five phases in `docs/15-AGENT-WORKFLOW.md` and relevant module-specific skills. This is a repeatable workflow, not a license to expand scope or perform Git publication.

## Starting a task

1. Establish the user's desired observable behavior and completion criteria. Identify explicit non-goals and approval gates. Do not substitute a generic feature checklist.
2. Inspect `git status --short --branch`, active branch, relevant manifests and actual source files; find nearest tests and existing patterns. Do not assume docs match installed code.
3. For a bug: obtain the exact failing command, error or reproducible case; trace input → caller → implementation → state/persistence → output. Keep one working hypothesis at a time and verify it with evidence.
4. For a feature: locate domain owner, API/data interfaces, permissions, feature gates, existing reusable modules and integration points. Document the smallest safe change and its test or rollback strategy.
5. For substantial changes, give a compact plan with files/slices/risk. For a small change, proceed without unnecessary planning documents.
6. Select checks for the affected layers and flag critical security/transaction invariants. Do not run full validation merely to begin coding unless a baseline failure needs investigation.

## Implement deliberately

- Prefer minimal changes in existing layers. Keep related edits coherent; avoid moving files, renaming public APIs or swapping libraries without a concrete need.
- Reuse types/schemas/contracts and existing error semantics; reject invalid inputs at boundaries. No placeholder success paths, fake data posing as real, silent catch blocks or happy-path-only code.
- Consider invalid inputs, retries, concurrent calls, stale authorization, partial outages, timeouts and safe error messages where applicable.
- Add focused regression tests at the lowest layer proving the behavior, with integration/contract tests when boundary behavior matters. Never weaken tests to force green.
- Finish a coherent vertical slice before comprehensive validation; run directly relevant fast checks after logical changes. Prove critical security and transaction invariants before expanding implementation. Avoid repeated full builds, all integration tests, Docker reprovisioning or emulator acceptance during routine coding.
- If a new env key, migration, auth policy or API contract is needed, load the corresponding skill and update its source of truth in the same task.
- Never silently create 10 ancillary documents, broad abstractions or unrelated refactors for one change.

## Verification and self-review

1. When implementation is complete, run targeted unit tests, affected contract/type checks and positive, negative and boundary cases. Schema, transaction, authorization or persisted-state changes require appropriate database/integration checks; mocks do not prove real transaction behavior.
2. Inspect failures before fixes and rerun affected checks. Record limitations (missing Docker, physical device, credentials, external provider) without claiming successful execution.
3. On the final implementation candidate, run applicable full acceptance once: `pnpm.cmd validate`, relevant database/integration checks, `pnpm.cmd audit:dependencies`, `pnpm.cmd environment:check` and required mobile/browser acceptance. Use `pnpm` on Linux. Documentation-only work follows the narrower checks in the workflow's test-selection table.
4. Do not repeat checks already covered by `validate` solely for additional test counts. Reuse still-valid evidence; rerun full validation only when later fixes invalidate its result. Preserve mandatory CI and milestone gates, including owner review before the next slice.
5. Review `git diff --check`, the full diff, access/data exposure, env parity, migration safety, secrets, dependencies and generated files. Confirm acceptance criteria against observed behavior; known blocking security/correctness failures prevent publication.
6. Handoff only: what changed; tests and actual results; incomplete work; risks/blockers; Git commit/PR status. State unrun checks and reasons, and any required owner approval.

## Communication style

Use clear engineer-to-engineer language: `Cause: ...`, `Changed: ...`, `Verified: ...`, `Remaining: ...` when helpful. No roleplay, filler, praise, '100% production ready' claims, invented benchmark numbers or narrating each trivial command. Be concise without withholding blockers or caveats.
