# TRISSEA — Tuguegarao Tricycle Booking Platform

**Blueprint edition:** v1.5 · 2026-11-05 · Tuguegarao City pilot. **NOT a functioning application or approved production fare engine.**

**M1 local foundation complete:** local API and UI shells, shared packages,
migration tooling and CI configuration have passed local engineering acceptance.
Android emulator and admin browser evidence is recorded; no booking flow is enabled.
See [Windows setup and validation record](docs/49-M1-FOUNDATION.md) for commands,
scope, security boundaries and outstanding checks.

## Read first
- `docs/00-PILOT-STATUS.md` — current decisions, unresolved legal/transport issues and first read order.
- `docs/34-TUGUEGARAO-PILOT-CHARTER.md` — city/TODA/vehicle scope and staged ride options.
- `docs/35-Fare-Matrix-Provenance.md` — user-provided 42 area-rate lines + within-poblacion ₱22/₱18; **NOT auto-approved**.
- `docs/36-FARE-ENGINE-AND-ADMIN.md` — admin rate edits, independent review, schedule, quote snapshots.
- `docs/37-ROLE-ACCESS-MATRIX.md` — city, TODA, fare reviewer, support, passenger and driver scopes.
- `docs/38-BOOKING-MVP.md` — end-to-end initial booking workflow and dispatch.
- `docs/39-TODA-SERVICE-RULES.md`, `docs/40-TRICYCLE-ROUTING.md` — pickup policy and restricted roads.
- `docs/41-AUTH-PRIVACY.md` — SMS OTP, driver approval, MFA, retention and Philippine privacy.
- `docs/42-MVP-IMPLEMENTATION-GATES.md`, `docs/43-DECISION-REGISTER.md` — implementation milestones and sign-off blockers.
- `AGENTS.md` and `BOOTSTRAP_AGENT_PROMPT.md` — rules to use with coding agents.

## First rollout / priorities
- **Regular** — direct exclusive on-demand, first real vertical feature to implement.
- **Special** — whole-unit direct booking, later ordered stops/round trip when legally priced.
- **Shared** — per-seat shared ride only on approved corridors with verified occupancy, later gated release.
- **Reservation** — passenger future pickup window at TODA terminal, retained in blueprint but **disabled in the initial pilot**; terminal queue operations similarly deferred unless city authorizes them.
- TODAs: verified city organizations, not auto-onboarded. All eligible TODAs can be supported in the model.
- Drivers/passengers: phone SMS OTP; drivers require additional TODA+vehicle verification; admin email/password+MFA; cash first.

## Selected stack
Two React Native + Expo/TypeScript apps (passenger and driver), React/Vite admin,
NestJS/Fastify API, PostgreSQL/PostGIS + Drizzle, Redis/BullMQ worker, Socket.IO,
MapLibre plus separately approved routing. M2 uses TRISSEA phone OTP and sessions,
mock SMS locally/CI, future gated PhilSMS transport, and self-hosted Keycloak admin
OIDC/password/TOTP through Nest BFF. Supabase's historical proposal is superseded
and rejected; see [ADR-011](docs/55-ADR-011-M2-IDENTITY-TENANCY-DRAFT.md).

## Included
Existing v1.4 docs/design/AGENTS/Cursor/Copilot/Claude rules/OpenAPI/reference SQL retained, plus Tuguegarao domain documents, role policies, reference fare import, 2 original source images, 43-row CSV (42 named areas + 1 poblacion), a separate design-only MVP OpenAPI spec, security/UX/admin/QA requirements and update notes.

## Windows local development
Start with [M1 setup](docs/49-M1-FOUNDATION.md). `pnpm.cmd infra:up` starts local
PostGIS and Redis; `pnpm.cmd db:up` applies the isolated M1 foundation migration.
Use `pnpm.cmd dev:api`, `dev:admin`, `dev:passenger` and `dev:driver` for the shells.
Use `python scripts/validate_tuguegarao_fares.py` to verify CSV transcription
**structure**, not official fare approval.

M2.1 database tests use a separate ephemeral cluster and a randomly named disposable
database. See [identity foundation setup/evidence](docs/57-M2-IDENTITY-FOUNDATION.md).
`db:up` remains limited to M1 unless disposable identity mode is explicitly enabled.

The [M2.3 passenger backend record](docs/59-M2-PASSENGER-AUTHENTICATION.md)
documents local mock OTP, revocable app sessions and the isolated non-public
test harness. Use `pnpm.cmd test:passenger:auth` against the separate M2 cluster.
`pnpm.cmd passenger:prepare` generates an ignored disposable local API environment;
`pnpm.cmd dev:passenger:api` starts it on loopback 4100. Passenger auth is disabled
in the ordinary M1 environment. No live SMS or mobile login acceptance is claimed.

[M2.4 driver backend](docs/60-M2-DRIVER-AUTHENTICATION.md) adds purpose-bound driver
login, pending synthetic TODA/vehicle requests and eligibility evaluation while
keeping online/GPS/dispatch disabled. `pnpm.cmd driver:prepare` creates a separate
ignored disposable environment; `pnpm.cmd dev:driver:api` serves it on loopback
4101. Run `pnpm.cmd test:driver:auth` for the isolated mock harness. Native
authentication/storage and real verification acceptance remain pending.

[M2.5 Keycloak administrator integration](docs/61-M2-KEYCLOAK-ADMIN.md) provides
an isolated password/TOTP provider, encrypted BFF session handling and a functional
admin identity panel. Use `keycloak:prepare`, `keycloak:up`, `keycloak:provision`,
`admin:prepare` and `test:admin:auth`; runtime commands are `dev:admin:api` and
`dev:admin:identity`. No default TRISSEA administrator or public registration is
created. Local evidence does not approve production or recovery/delegation.

## Release safety
Screenshot figures alone do not establish a lawful origin→destination price or private vehicle hire tariff. **No production fare activation until signed applicable city/TODA source, road/MTOP service area approval, identity/privacy controls and physical device testing.** Old design docs should be read with the v1.5 status document, which supersedes conflicting launch-order recommendations.
