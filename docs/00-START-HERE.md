> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# Start Here — Engineering Map

## Read order
1. `01-PRD.md` — who the product is for, inclusions/exclusions, acceptance criteria.
2. `02-ARCHITECTURE.md` — system boundaries and code organization.
3. `03-DISPATCH-RULES.md` — matching and terminal queues; mandatory invariants.
4. `04-RIDE-STATE-MACHINE.md` — all legal state transitions.
5. `08-DATA-MODEL.md` and `database/001_core.sql` — storage and transactional guards.
6. `09-API-REALTIME.md` and `contracts/openapi.yaml` — published interface.
7. `design/DESIGN-BIBLE.md` — UI and accessibility decisions.
8. `11-SECURITY-PRIVACY-PH.md` — Philippine compliance and security.
9. `13-TESTING-SLOs.md`, `14-ROADMAP.md` — delivery gates.
10. `22-EXPO-IMPLEMENTATION.md`, `23-EXPO-GPS-ACCEPTANCE.md` — mobile architecture and device validation.

## Product boundaries
- A tenant represents an operator/cooperative/fleet with service zones, approved drivers, authorized terminals and fare rules.
- The platform (superadmin) controls onboarding, shared safety policy and system configurations.
- Tenant admins manage their own operations only.
- Drivers have global identity but tenant-specific membership/authorization.
- Passengers may request rides only within a configured/approved service offering.
- Terminal FIFO position is not a guarantee of assignment: safety, service eligibility and vehicle compatibility take precedence.

## Developer environment
- Windows 11 + WSL2 or Windows + Docker Desktop; VS Code/Android Studio/Android SDK; Node active LTS; pnpm; Expo CLI via `npx expo`; Git.
- Docker Compose contains local PostgreSQL/PostGIS and Redis only.
- Never commit real credentials, live coordinates, identity documents, phone numbers, or payment tokens.

## Definition of ready
A work item must identify actor, role/tenant boundary, state transitions, API/schema changes, failure cases, tests, metrics and acceptance criteria.

## Definition of done
Tests for concurrency and permissions pass; migration tested forward; docs/API updated; security and privacy reviewed; operation has idempotency and observability; product owner signs off.

## Product-owner confirmed Reservation decision (ADR-008)
TRISSEA `RESERVATION` is a **passenger-booked TODA terminal pickup window**. Read `docs/28-TODA-RESERVATIONS.md` and `docs/30-ADR-008-PASSENGER-RESERVATION.md` before editing Reservation flows, database or APIs. It is NOT a driver queue booking. Local pickup slots, quotas, fees, walk-in fairness, and permits still require operator/LGU approval.
