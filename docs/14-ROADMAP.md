> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# Implementation Milestones — Dependency-driven Roadmap

## Phase 0 — Product/legal/design baseline (Milestone M0)
- Confirm pilot service geography, vehicle category, operator licensing route, route rules and fare governance.
- Finalize ADRs, UI flow prototypes, regulatory checklist, privacy/data retention.
**Exit:** written policy approval, initial fare matrix, test tenant and demo zone.

## Phase 1 — Infrastructure & identity (M1)
- Monorepo structure, lint/test/CI, Docker dev stack, DB migrations, API health, auth integration, users/tenants/memberships.
- Admin login and tenant-scoped navigation.
**Exit:** automated tenant isolation checks and repeatable local setup.

## Phase 2 — Passenger quote and booking (M2)
- Expo/React Native passenger map/place search, map/provider adapter, fare engine, quote expiry, create ride with idempotency and ride events.
- Basic dispatcher view and simulated demand.
**Exit:** one passenger can make a confirmed SEARCHING booking with no duplicate bookings.

## Phase 3 — Driver availability and on-demand dispatch (M3)
- Expo/React Native driver onboarding/verification, GPS shift protocol, PostGIS lookup, worker offers and expiry, Socket.IO notification.
- Assignment transaction + cancel/reconciliation flows.
**Exit:** simulated two-way passenger→driver ride can complete and survive reconnect.

## Phase 4 — Terminal queues and hybrid fallback (M4)
- Terminal geofences/route/service eligibility, FIFO queue, timeout policy, queue position updates, on-demand alternative acceptance.
**Exit:** two drivers racing accept/queue operations remain consistent; audited queue behavior demonstrated.

## Phase 5 — Operational readiness (M5)
- Admin reports, support incident tools, receipts, alerts, backups, rate limits, privacy notice, Android location compliance, field-testing.
**Exit:** all release gates in `13-TESTING-SLOs.md` and `11-SECURITY-PRIVACY-PH.md` passed.

## Phase 6 — Licensed limited pilot (M6)
- Small real user group; measure dispatch, map coverage, battery, GPS drift, support; tune fares and queue policies with change control.
**Exit:** agreed safety, reliability, accuracy and legal gates met; rollout decision documented.

## Priority backlog
P0: tenancy/auth; booking state machine; transaction safety; location permission; queue exclusivity; outbox; offer TTL.
P1: UX quality; receipt; driver docs; support; rate limits; audit; cancellation policies; telemetry alerts.
P2: promotions; demand heatmaps; surge; advanced routing; driver incentives; automated settlements.

## Agent task template
Use `docs/15-AGENT-WORKFLOW.md` and `.github/ISSUE_TEMPLATE/feature.md` before delegating implementation. No agent may implement every phase in one giant change.


## Superseding ride-option implementation order (ADR-007)
The milestone labels in the original roadmap describe the core platform; the **four commercial ride options are staged** as follows:
1. **Regular**: the first deployable passenger-to-driver private booking, from quote to receipt.
2. **TODA queues and Reservation**: queue lifecycle first, then **passenger** TODA pickup time-window holds/confirmation/check-in, fare consent and linked FIFO dispatch after obtaining LGU/TODA-approved operating policies.
3. **Special**: whole-unit itinerary, ordered stops, optional return trip, stop/wait pricing and amendments.
4. **Shared**: true pooling with passenger-by-passenger booking records, route-segment seat accounting, driver engagement locks and detour policies. This is intentionally a later high-complexity release.

Release all four service-option cards only when configured for a tenant and authorized service area; disable or label unavailable services before implementation.
