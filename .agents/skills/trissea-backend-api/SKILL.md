---
name: trissea-backend-api
description: Implement or debug TRISSEA NestJS/Fastify modules, HTTP controllers, OpenAPI contracts, input validation, domain services, BullMQ jobs and server integration. Use for API/backend changes; pair with auth-security or database-integrity when those boundaries are touched.
---

# Backend and API engineering

## Trace first

Read `AGENTS.md`, the domain's relevant ADRs/flow, `contracts/openapi-mvp.yaml`, API module wiring, existing guards, repositories, tests and current dependencies. Distinguish implemented routes from design-only declarations.

## Implementation standard

1. Define observable operation contract: principal/role/scope, request schema, state preconditions, response, idempotency, error codes, audit effect and external failure outcomes.
2. Keep controllers thin: parse/validate input, call a domain service, serialize typed DTOs. Keep policy and transactions in appropriate application/domain layers. No direct business logic in transport decorators or frontend.
3. Use explicit module boundaries and dependency injection; do not import another module's private repository tables or create circular dependencies to 'make it compile'.
4. Validate untrusted parameters at runtime; reject mass assignment; sanitize errors and redact secrets. Respond with stable, documented error codes and appropriate HTTP statuses. Use consistent UTC and monetary/coordinate formats.
5. Operations crossing authoritative states must use reviewed PostgreSQL transactions, constraints, expected versions and idempotency. Audit/outbox references commit with the state mutation; Redis/queues are not the source of truth.
6. Queue workers must be idempotent and observable with retry/backoff/dead-letter behavior. Reconcile unknown external outcomes; never claim exactly-once third-party delivery without evidence.
7. Update the relevant versioned OpenAPI specification and generated clients/tests in the same slice. Do not silently alter legacy or broad future contracts.
8. Avoid premature generic repositories, bespoke dependency injection frameworks, extra HTTP services and speculative endpoints.

## Prove

Tests include positive and negative authorization, malformed inputs, idempotent repeat, same-key different-body conflict, concurrent state change, DB/Redis/provider outage and secret-safe errors as applicable. Run relevant API test, typecheck, contract check and lint; report real results and endpoints not yet operational.
