# TRISSEA v1.5 — Tuguegarao Pilot Status (read first)

**As of 2026-11-05.** This package is a **planning and implementation contract**, not a functioning ride-hailing application, verified legal fare schedule or production release.

**Implementation update:** M1 foundation source and CI have been added. M1 is still
in progress; [the validation record](49-M1-FOUNDATION.md) distinguishes passed
source checks from blocked installation/runtime/device checks. Statements below
about the original ZIP describe the blueprint baseline, not completed software.

## Decisions adopted for initial engineering
- Pilot jurisdiction: Tuguegarao City, Cagayan, Philippines; timezone `Asia/Manila`.
- Tricycles only; onboard **verified, authorized** TODAs/drivers/vehicles. "All TODAs" means invitation and eligibility, not approval by default.
- Passenger mobile and driver mobile: React Native + Expo (custom development builds for native map/background location); admin React + Vite; API NestJS/Fastify; PostgreSQL/PostGIS; Redis/BullMQ; Socket.IO.
- Services remain four official product types: `REGULAR`, `SHARED`, `SPECIAL`, `RESERVATION`.
- **Initial product focus**: on-demand Regular, Shared and Special. TODA terminal passenger Reservation stays documented but **disabled at pilot launch** until policy approved.
- Passenger and driver: verified Philippine phone number using SMS OTP. Driver **cannot receive jobs** until city/TODA staff have verified the driver and vehicle. Admin: email/password + MFA.
- Initial payment = cash, with explicit collection state and reconciliation. Fare adjustment managed in admin with versioned maker/checker approval and audit trail.
- Existing May 2025 TC-TRISSEA government turnover and operations manual must be reviewed before replacing or integrating a live system; do not assume permission to overwrite its data or system.

## Unverified items — must not become production facts
1. The provided fare images have 42 named-area entries plus within-poblacion ₱22/₱18. **Their effective date, official signed ordinance, geographic origin and application to whole-unit/private/Shared/Special trips have not been independently confirmed.** Imported as `DRAFT_UNVERIFIED`, never active by default.
2. "All accessible roads" is NOT valid routing authorization. City Ordinance 09-08-2021 restricts national-highway tricycle use with specified exceptions; obtain a CURRENT signed road/service policy and city-approved GIS restrictions before live route proposals.
3. TODA pickup rules: passengers booking a seat should appear at a designated terminal; if a TODA is asked to collect them elsewhere, the passenger reportedly pays for full vehicle seats. This is a **proposed operations policy requiring operator/LGU confirmation** and an explicit passenger quote. Do not silently charge seats×fare without legal approval, and never assume seat capacity.
4. Local discount eligibility proof and passenger fares versus per-vehicle fares need authorized written definitions.
5. Backend, UI, API, migrations and agents are **not implemented or production validated** in this ZIP.

## Read order
`docs/34-TUGUEGARAO-PILOT-CHARTER.md` → `docs/35-Fare-Matrix-Provenance.md` → `docs/36-FARE-ENGINE-AND-ADMIN.md` → `docs/37-ROLE-ACCESS-MATRIX.md` → `docs/38-BOOKING-MVP.md` → `docs/39-TODA-SERVICE-RULES.md` → `docs/40-TRICYCLE-ROUTING.md` → `docs/41-AUTH-PRIVACY.md` → `docs/42-MVP-IMPLEMENTATION-GATES.md` → `AGENTS.md`.

## Blockers, owners and acceptance criteria
See `docs/43-DECISION-REGISTER.md`. Non-legal development may start with mock fare/routing; **real monetary bookings remain blocked** until local fare, permits, route and operator approval is documented.
