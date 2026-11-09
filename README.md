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

Use [ADR 66 and the canonical infrastructure guide](docs/66-ADR-DEVELOPMENT-INFRASTRUCTURE.md).
Development configuration is `.env.local`; tracked examples are `.env.local.example`
and `.env.production.example`. Never copy over an existing private configuration.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev:infra:prepare
pnpm.cmd dev:infra:up
pnpm.cmd test:infra:bootstrap
pnpm.cmd keycloak:provision
pnpm.cmd dev:infra:check
```

The single `trissea-dev` project contains core PostgreSQL/PostGIS, a separate
fixture PostgreSQL service, Redis and Keycloak. Core application/IdP databases
have separate owners and runtime credentials. Tests create manifest-verified
random databases and Redis namespaces; no production resources are used.
`dev:infra:down` stops this project without removing volumes. `status` reports
safe metadata and `logs` emits only sanitized lifecycle events. Do not start the
retired per-milestone projects, delete retained volumes or globally prune Docker.

For standalone synthetic integration fixtures, run `passenger:prepare`,
`driver:prepare` and `admin:prepare` sequentially as needed, then the corresponding
`dev:passenger:api`, `dev:driver:api`, `dev:admin:api` and `dev:admin:identity`.
Mobile integration commands are `dev:passenger:identity` and `dev:driver:identity`.
Their fixture credentials and mock inboxes remain private, never public APIs.
See [M2.7 evidence](docs/63-M2-INTEGRATION-SECURITY-ACCEPTANCE.md) and
[environment preservation](docs/65-ENVIRONMENT-CONSOLIDATION.md).

`pnpm.cmd validate` runs contracts, lint, TypeScript, tests and API/admin builds.
The infrastructure guide lists the full isolated authentication/migration suites.
`db:up` remains limited to M1 unless disposable identity mode is explicitly enabled;
never run rollback acceptance on a retained database. Fare CSV validation proves
transcription structure only, never official fare approval.

## Release safety
Screenshot figures alone do not establish a lawful origin→destination price or private vehicle hire tariff. **No production fare activation until signed applicable city/TODA source, road/MTOP service area approval, identity/privacy controls and physical device testing.** Old design docs should be read with the v1.5 status document, which supersedes conflicting launch-order recommendations.
