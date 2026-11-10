---
name: trissea-testing-acceptance
description: Create, run or audit TRISSEA unit/integration/contract/concurrency/security tests, Android emulator and admin browser checks, CI evidence and milestone acceptance. Use whenever test coverage, regression QA or readiness claims are requested; not for design-only ideation.
---

# Testing and acceptance — evidence, not assertions

Use the phases and test-selection table in `docs/15-AGENT-WORKFLOW.md`. Select tests by affected behavior and risk; do not run full validation merely to start development unless investigating a baseline failure.

## Build a risk-driven test matrix

For every changed behavior, identify contract, layer, positive case, negative case, failure/retry path, concurrency exposure and authorization scope. Focus on proving actual domain invariants rather than maximizing test counts.

- Unit: pure logic and validation with representative edge cases.
- Integration: real repository/service/migration boundaries against **disposable local infrastructure**; no production PII or public services.
- Local Docker uses only `trissea-dev` / `infra/compose.dev.yml` via `dev:infra:*` (ADR 66). Tests create scoped disposable databases and Redis namespaces, not permanent per-milestone projects/dotenv files. Preserve core/IdP data, volumes and credentials on stop/restart; never globally prune Docker or recreate legacy stacks. Production activation remains separately gated.
- Contract: request/response schema, OpenAPI/generated types, error codes, negative DTO/mass assignment checks.
- Concurrency: duplicate OTP/refresh, driver accept races, seat capacity, fare maker-checker, repeated webhook/workflow events as relevant.
- Security: wrong account/city/TODA, stale or revoked roles, missing MFA, IDOR, secret leakage, abuse budgets and fail-closed outages.
- UX: Android dev clients using ADB/emulator where available; admin flows via Playwright. Check screen state, dark/light, font scaling, keyboard, offline and accessibility. Physical Android/iOS/GPS claims need actual device evidence.

## Execute and assess

1. Inspect existing `package.json` scripts and test config; avoid inventing commands. During implementation, run directly relevant fast checks after logical changes and preserve meaningful slice checkpoints. Avoid repeated full builds, all integration tests, Docker reprovisioning or emulator acceptance.
2. Prove critical security and transaction invariants before broader implementation. Once the feature is complete, run targeted units, affected contract/type checks and relevant positive, negative and boundary cases. Schema, transaction, authorization or persisted-state changes require real database/integration checks; mocks cannot replace real transaction validation.
3. Run applicable full acceptance once on the final implementation candidate: `pnpm.cmd validate`, relevant database/integration tests, `pnpm.cmd audit:dependencies`, `pnpm.cmd environment:check`, diff/secret checks and mobile/browser acceptance where required. Use `pnpm` on Linux. Documentation-only changes use documentation/link and applicable skill/configuration checks; preserve required CI and milestone criteria.
4. Do not duplicate checks already covered by `validate` solely to increase test counts. Reuse valid focused evidence when relevant code, dependencies, configuration and environment are unchanged. If final checks find defects, investigate, fix and rerun affected tests; repeat full validation where fixes invalidate its prior result. Never delete assertions, blanket skip tests, relax policy or change production logic solely to make CI green.
5. Capture command, environment type, exit code and useful error summary without leaking environment values or tokens. Do not record screenshots with real OTPs, phone numbers or identity documents.
6. Differentiate **not run**, **blocked**, **failed**, **passed in simulation**, **passed on physical device** and **production verified**. Report unrun checks and precise reasons or missing prerequisites.
7. Review `git diff`, secrets, package changes, env/template parity, migrations, attack paths and acceptance criteria before declaring the local slice complete. Never publish known blocking security or correctness failures.

## Handoff format

Report only changes, tests/results, incomplete work, risks/blockers and Git commit/PR status. A compact matrix (check, evidence/result, limitation) helps for high-risk changes. Include unrun checks and reasons, defects and required approvals. Never treat green health checks as proof of working authentication, dispatch or production readiness.
