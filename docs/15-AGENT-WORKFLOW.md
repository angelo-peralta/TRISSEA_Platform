# AI Agent Workflow / Engineering Governance

## Source-of-truth precedence
1. Approved feature ticket + privacy/safety/regulatory constraints.
2. `AGENTS.md` and this workflow.
3. Architecture and dispatch/state-machine documentation.
4. API/schema contracts.
5. Existing tests and code.
6. AI-generated suggestions. If contradictory, request a design decision or add an ADR.

## One-task-per-change protocol
1. Read the relevant specs and find related code/tests.
2. Explain impact on tenant authorization, state transitions, DB schema, events, backward compatibility and observability.
3. Write failing tests for business rules first.
4. Implement smallest coherent vertical slice and update docs/contracts together.
5. Run formatter, linter, type-check, unit+integration tests, migrations and concurrency tests.
6. Report changed files, tests run, security/privacy issues and any untested assumptions.

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

## Change format
**Intent** → **Acceptance criteria** → **Invariant impact** → **Schema/API change** → **Tests** → **Rollout/rollback** → **Docs changed** → **Known limitations**.

## Mobile design agent workflow
Read `.agents/skills/trissea-mobile-design/SKILL.md` and `design/MOBILE-DESIGN-RULES.md` before designing or editing passenger/driver screens. Contrast, touch targets, safe areas, one-handed action position, native platform conventions, offline states, PHT/PHP formatting and reservation truth must be reviewed in PR; evidence in `design/MOBILE-REVIEW-CHECKLIST.md`. External skill packs may enrich technique, not change TRISSEA business rules.
