---
name: trissea-engineering-workflow
description: Execute TRISSEA coding sessions for nontrivial features, bugs and refactors: inspect implementation, diagnose root cause, plan narrowly, make focused edits, test and hand off verifiable results. Use for programming work across backend, mobile, admin or workers; skip for trivial read-only questions.
---

# Engineering workflow — perform the work, prove the result

Follow `AGENTS.md` and relevant module-specific skills. This is a repeatable workflow, not a license to expand scope or perform Git publication.

## Starting a task

1. Establish the user's desired observable behavior and completion criteria. Identify explicit non-goals and approval gates. Do not substitute a generic feature checklist.
2. Inspect `git status --short --branch`, active branch, relevant manifests and actual source files; find nearest tests and existing patterns. Do not assume docs match installed code.
3. For a bug: obtain the exact failing command, error or reproducible case; trace input → caller → implementation → state/persistence → output. Keep one working hypothesis at a time and verify it with evidence.
4. For a feature: locate domain owner, API/data interfaces, permissions, feature gates, existing reusable modules and integration points. Document the smallest safe change and its test or rollback strategy.
5. For substantial changes, give a compact plan with files/slices/risk. For a small change, proceed without unnecessary planning documents.

## Implement deliberately

- Prefer minimal changes in existing layers. Keep related edits coherent; avoid moving files, renaming public APIs or swapping libraries without a concrete need.
- Reuse types/schemas/contracts and existing error semantics; reject invalid inputs at boundaries. No placeholder success paths, fake data posing as real, silent catch blocks or happy-path-only code.
- Consider invalid inputs, retries, concurrent calls, stale authorization, partial outages, timeouts and safe error messages where applicable.
- Add focused regression tests at the lowest layer proving the behavior, with integration/contract tests when boundary behavior matters. Never weaken tests to force green.
- If a new env key, migration, auth policy or API contract is needed, load the corresponding skill and update its source of truth in the same task.
- Never silently create 10 ancillary documents, broad abstractions or unrelated refactors for one change.

## Verification and self-review

1. Run the most focused reliable check first, then affected package checks, then broader validation when warranted.
2. Inspect all failures and rerun only after an actual fix. Record limitations (missing Docker, physical device, credentials, external provider) without claiming successful execution.
3. Review `git diff --check`, diff scope, access/data exposure, env parity, migration safety, new dependencies and generated files.
4. Confirm acceptance criteria against observed behavior, not just compilation or unit-test counts.
5. Summarize in five short fields: changed; evidence; behavior; limitations; next approval/action. Mention branch/commit only if actual.

## Communication style

Use clear engineer-to-engineer language: `Cause: ...`, `Changed: ...`, `Verified: ...`, `Remaining: ...` when helpful. No roleplay, filler, praise, '100% production ready' claims, invented benchmark numbers or narrating each trivial command. Be concise without withholding blockers or caveats.
