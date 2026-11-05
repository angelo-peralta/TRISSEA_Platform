> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# Architecture Decision Records and Open Questions

## ADR-001: Mobile React Native + Expo, web React/Vite
**Accepted 2026-11-04 (supersedes Flutter decision in blueprint v1.0).** Use two Expo Router + TypeScript apps for passenger and driver to share typed API contracts, development practices and design tokens with NestJS/React web. Expo development builds are mandatory for native MapLibre and background-location proof-of-concepts. The driver app may require a Kotlin native foreground-service module if real-device reliability testing fails; Flutter is not a planned dependency. Admin remains React + Vite.

## ADR-002: Backend NestJS + Fastify
**Accepted for blueprint.** Modular domain boundaries with TypeScript, familiar to existing team. HTTP adapter choice is revisitable after benchmarks; NestJS's newer NodeAdapter is another option, not a reason to prematurely switch.

## ADR-003: PostgreSQL/PostGIS + Drizzle + SQL critical transactions
**Accepted for blueprint.** Spatial querying and transactional constraints are fundamental. Drizzle maps ordinary tables and PostGIS columns; audited parameterized SQL for competing offer/queue mutations. Avoid ORM-specific coupling of domain logic.

## ADR-004: Separate job worker + DB outbox
**Accepted.** HTTP response must not wait for all delivery work. At-least-once jobs require idempotent workers and reconciliation.

## ADR-005: Start with hosted Singapore-region evaluation
**Provisional.** Choose region after measured latency, vendor security, cross-border privacy assessment and availability/cost review.

## ADR-006: No full microservices initially
**Accepted.** Scale API and worker instances without fragmenting ride transactions; split services when metrics justify.

## Decisions pending owner/legal input
1. Initial authorized service class (TNVS car, shuttle, tricycle, motorcycle or other), pilot city and operator.
2. Whether one user can belong to multiple tenants simultaneously and how driver shift selection works.
3. Payment collection/commission model and receipts/tax requirements.
4. Terminal policy: decline penalty, queue bypass, shared-seating support, route eligibility, return-to-tail/head behavior.
5. Validate the chosen `@maplibre/maplibre-react-native` version against the selected Expo SDK/React Native version, approved tile/geocoding/routing vendor and attribution requirements.
6. OTP identity provider and phishing/recovery controls.
7. Required data retention and privacy impact assessment owner.
8. Whether passenger pickup verification uses PIN, QR, in-app confirmation or dispatcher authorization.
9. Production SLO, RPO/RTO and budget; regional hosting contract.
10. Third-party insurance, emergency and incident response workflows.

## Change process
Any change impacting assignment fairness, financial amounts, legal permissions, security, privacy or published APIs needs a new numbered ADR with alternatives, decision, consequence and migration plan.


## ADR-007: Four TRISSEA ride options
**Accepted 2026-11-05.** Official service options are Regular, Shared, Special and Reservation. Keep `rideOption` separate from dispatch mode. Shared pooling, Special itinerary, and TODA Reservation have distinct domain modules/constraints. See `docs/25-RIDE-OPTIONS.md`.

**ADR-008 accepted 2026-11-05:** Reservation is passenger-only for TODA terminal pickup time windows. Driver future queue reservations are out of scope. Slot quotas, pickup grace periods, fares, walk-in treatment and operator/LGU permissions remain to be approved locally. See `docs/28-TODA-RESERVATIONS.md` and `docs/30-ADR-008-PASSENGER-RESERVATION.md`. Shared pooling remains blocked until capacity/driver engagement concurrency tests pass.
