# TRISSEA — Efficient Engineering and Testing Workflow

Optimize implementation speed without reducing correctness, security or reliable Git delivery. Complete the approved scope with focused checks during development and one applicable acceptance run on the final candidate. This workflow does not authorize the next milestone slice or Git publication.

## Source-of-truth precedence
1. Approved feature ticket + privacy/safety/regulatory constraints.
2. `AGENTS.md` and this workflow.
3. Architecture and dispatch/state-machine documentation.
4. API/schema contracts.
5. Existing tests and code.
6. AI-generated suggestions. If contradictory, request a design decision or add an ADR.

## Phase 1 — Inspect and plan

- Read `AGENTS.md`, relevant skills and applicable project documents. Inspect the active branch, working tree, implementation, dependencies, nearest tests and actual package scripts.
- Identify the smallest complete feature scope, affected modules and observable acceptance criteria. Flag database, authentication, authorization and transaction risks, including state transitions, events and compatibility.
- For complex or high-risk work, give a concise implementation plan. Do not run the full suite merely to start coding unless a baseline failure needs investigation.

## Phase 2 — Implement

- Use existing architecture and conventions; avoid unrelated refactors, extra abstractions, documentation or infrastructure.
- Complete a coherent vertical slice before comprehensive validation. Add meaningful regression tests, preferably a failing case first for a bug or business-rule change.
- After a logical change, run only directly relevant fast checks. Do not repeatedly run full builds, all integration tests, Docker reprovisioning or Android emulator acceptance during routine coding.
- Test critical security and transaction invariants before proceeding to broader implementation. Never describe untested code as verified.

## Phase 3 — Focused verification

- When the feature implementation is complete, run targeted unit tests and affected contract/type checks. Cover positive, negative and boundary cases, plus relevant failures, retries and concurrency.
- Run database/integration tests when schema, transactions, authorization or persisted state changes. Use manifest-verified disposable databases and scoped Redis namespaces in the canonical local stack; preserve retained data, credentials and volumes.
- Investigate failures before fixing them, then rerun affected checks. Do not disable or weaken tests or substitute mocks for real transaction behavior.

## Phase 4 — Final validation

When all intended implementation changes are ready for Git delivery, run the applicable acceptance suite **once against the final candidate**:

- `pnpm.cmd validate` (contract parity, lint, workspace type checks, tests and API/admin builds).
- Relevant database/integration tests selected from the actual `package.json` scripts and milestone criteria; `validate` does not include these suites.
- `pnpm.cmd audit:dependencies` and `pnpm.cmd environment:check`.
- Complete diff, secret and generated-artifact review, including `git diff --check`.
- Mobile/browser acceptance only where the affected functionality or milestone criteria require it; native dependencies also need Expo compatibility and affected native build checks.

Use `pnpm` on Linux. For documentation-only changes, use documentation/link and applicable skill/configuration checks; full application validation, dependency audit, mobile builds and device acceptance are not required by default. Required CI and explicit milestone gates still apply.

Do not separately rerun checks already covered by `validate` just to increase test counts. Reuse valid focused evidence when the relevant code, dependencies, configuration and test environment have not changed. If final validation finds a defect, fix it and rerun affected checks; repeat full validation where those fixes invalidate the prior result. Report failures, blocked checks and unrun checks with their reasons. Known blocking security or correctness failures prevent Git publication.

## Phase 5 — Git delivery

After required checks pass, follow [the Git rules](50-GIT-AND-GITHUB-AGENT-RULES.md):

1. Inspect the complete diff, migration safety and security implications.
2. Exclude unrelated files, credentials and generated artifacts; stage explicit task paths and inspect the staged diff for secrets.
3. Commit the completed scope using a conventional commit. Preserve meaningful checkpoints for multi-feature milestones.
4. Push the feature branch and create a draft PR only if explicitly authorized.
5. Inspect GitHub Actions status after authorized publication; report observed results. Merge and deployment require separate explicit authorization.

Finish the approved feature or review-gated slice, verify it and prepare publication without expanding into the next slice. A roadmap is not authorization to continue.

## Test selection

| Changed layer | Applicable checks |
| --- | --- |
| Documentation only | Documentation/link checks and applicable skill/configuration validation; no full mobile rebuild by default |
| Pure TypeScript business logic | Targeted unit tests and relevant type checks |
| API contract | Contract generation/parity checks and affected API tests |
| Database migration | Migration integrity, rollback or roll-forward/preservation strategy and relevant integration tests on disposable databases |
| Authentication/authorization | Security negatives, session/permission tests and relevant integration tests |
| Mobile UI | Mobile type checks and affected screen tests; emulator acceptance when behavior or native integration warrants it |
| Native dependencies | Expo compatibility checks and affected native build tests |
| Docker/environment | Configuration, health, startup and affected integration tests; no destructive reprovisioning of retained infrastructure |

These checks complement final implementation acceptance. Test depth follows the invariants and milestone criteria, not a target count. Never skip security-critical checks or execute destructive operations on retained databases/infrastructure without explicit authorization.

## Hard stops
- Never invent official operator approvals, fare levels, legal requirements or provider pricing.
- Never replace atomic assignment with client-only state updates or Redis-only locks.
- Never skip authentication/authorization for "testing convenience" except an isolated, explicitly disabled-by-default mock fixture.
- Never log production plaintext phone numbers, PII documents, JWTs, passwords or precise route history unnecessarily.
- Never promise scalability without benchmark results.
- Do not replace foundational stack without ADR and owner sign-off.

## Quality bars
- All user-visible errors are actionable and localized-ready.
- Every write command is idempotent or explicitly documented non-idempotent.
- All operations traceable using trace ID and relevant immutable events.
- Schema migrations have forward/rollback or roll-forward strategy and data safety plan.
- New API endpoints have OpenAPI and tests.
- Device/location changes require real-device field checklist, not emulator-only testing.

## Handoff

Report only what changed, tests run and actual results, incomplete work, risks/blockers and Git commit/PR status. Include unrun checks and the reason, plus any required owner approval. Never mark unfinished or untested work complete or invent passing results.

## Mobile design agent workflow
Read `.agents/skills/trissea-mobile-design/SKILL.md` and `design/MOBILE-DESIGN-RULES.md` before designing or editing passenger/driver screens. Contrast, touch targets, safe areas, one-handed action position, native platform conventions, offline states, PHT/PHP formatting and reservation truth must be reviewed in PR; evidence in `design/MOBILE-REVIEW-CHECKLIST.md`. External skill packs may enrich technique, not change TRISSEA business rules.
