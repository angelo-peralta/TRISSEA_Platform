# TRISSEA v1.5 — Binding Rules for Coding Agents

**READ FIRST:** `docs/00-PILOT-STATUS.md`, `docs/34-TUGUEGARAO-PILOT-CHARTER.md`, `docs/43-DECISION-REGISTER.md`. In conflict with historical v1.0–v1.4 plans, **these v1.5 files take precedence**. No autonomous rewrite of city fare, MTOP, road, privacy or operator policy.

## Fixed engineering foundation
- Passenger/driver apps: React Native + Expo Router + TypeScript; driver requires custom dev build, native/background GPS proofs and tested phone behavior; React/Vite admin; NestJS/Fastify API/worker; Drizzle/PostgreSQL/PostGIS; Redis/BullMQ; Socket.IO; MapLibre.
- DB authoritative; queue, price, driver shift, offer acceptance and fare approval are SERVER validated transactional state machines. No direct client-side writes to operational tables.
- Use UTC timestamps persisted, PHT display, integer PHP centavos, geodata coordinates `[longitude,latitude]` and canonical server validation.
- Admin role and TODA/city resource scoping are mandatory; support read access masked by default; all privileged actions audited; no secrets/GPS/ID docs in logs.

## Release boundary
- `REGULAR`: develop full on-demand private quote→search→driver accept→travel→cash completion FIRST.
- `SPECIAL`: build direct exclusive next; stops/return only after approved fare/itinerary rules.
- `SHARED`: visible as OFF until approved legal route/seating + atomic passenger-seat/driver-engagement tests pass; route-corridor model first, not speculative dynamic pooling.
- `RESERVATION`: officially passenger pickup-time window at TODA terminal (ADR-008), **deferred from pilot launch**. Driver queue spot is NEVER reserved by passenger.
- `TODA`: city-scoped verified organizations, all eligible TODAs supported but none implicitly authorized. Driver's MTOP/TODA and approved road/service area must permit every offer.

## Fares: strict source gate
- Import the supplied image data only as DRAFT using `data/fare-matrix/tuguegarao-fare-matrix-user-supplied.csv` (42 named areas + within-poblacion ₱22/₱18).
- Do not infer origin, reverse direction, time validity, the legal per-seat unit, whole-unit price, discount mechanics or legal pickup fee from screenshot. Missing approvals → quote not available, NOT a default/hard-coded estimate.
- `CITY_FARE_EDITOR` drafts; separate `CITY_FARE_APPROVER` reviews signed source and effective date. No self-approval, no retroactive changes to accepted quote snapshots, no unapproved fees/surge.
- Candidate TODA rule "passenger pays full vehicle seats for pickup outside terminal" is **pending legal/association approval**, not a code constant. Vehicle seat capacity always from approved documents.

## Security and quality acceptance
- Passenger/driver login with SMS OTP; driver must also be verified; admin with MFA. Local-only mock OTP may be used, never production.
- Single active private driver engagement; Shared group engaged once with all individual ride records and segment capacity. Idempotency key for all booking/driver action mutations; DB outbox; dead-letter/retry/reconciliation.
- GPS on approved shifts only; foreground-first permission and Android reliability tests; never promise continuous GPS after OS termination. Enforce current road restrictions: physically accessible does not imply allowed for tricycles.
- Required tests: duplicate booking, stale quotes, two-driver racing accepts, double seat claim, tenant/TODA IDOR, maker-checker bypass, blocked-road routing, offline recovery, admin audit, cash reconciliation.
- No public rollout until signed city/TODA fare, zones, permits, privacy/retention and QA approvals. Local mocks permitted in clearly labeled staging.

## Work discipline
1. Read exact feature docs and `design/MOBILE-DESIGN-RULES.md` before generating screens or endpoints.
2. Scope one vertical feature per branch; list changes, proposed migrations, acceptance tests, and security implication.
3. Version API under `contracts/openapi-mvp.yaml`; original `contracts/openapi.yaml` remains broad future design contract.
4. Do not install unreviewed third-party skills, use unverified package versions, deploy secrets, or modify production data autonomously.
5. If missing a policy, log in `docs/43-DECISION-REGISTER.md`, implement a feature flag, and retain explicit failure behavior—not guessed defaults.
