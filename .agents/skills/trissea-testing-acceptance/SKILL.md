---
name: trissea-testing-acceptance
description: Create, run or audit TRISSEA unit/integration/contract/concurrency/security tests, Android emulator and admin browser checks, CI evidence and milestone acceptance. Use whenever test coverage, regression QA or readiness claims are requested; not for design-only ideation.
---

# Testing and acceptance — evidence, not assertions

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

1. Inspect existing `package.json` scripts and test config; avoid inventing commands. Run targeted tests first, then applicable `lint`, `typecheck`, `contracts:check`, `test`, `build`, `validate` or CI jobs.
2. Capture command, environment type, exit code and useful error summary without leaking environment values or tokens. Do not record screenshots with real OTPs, phone numbers or identity documents.
3. Investigate failing tests; do not delete assertions, blanket skip tests, relax policy or change production logic solely to make CI green.
4. Differentiate **not run**, **blocked**, **failed**, **passed in simulation**, **passed on physical device** and **production verified**. If dependencies are missing, explain precise missing prerequisite.
5. Review `git diff`, package changes, env/template parity, migrations, attack paths and acceptance criteria before declaring the local slice complete.

## Handoff format

Provide a compact matrix (check, evidence/result, limitation) for high-risk changes. Record defects, required approvals and next test environment. Never treat green health checks as proof of working authentication, dispatch or production readiness.
