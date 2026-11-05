# Tuguegarao Pilot Charter and Product Scope

## Market and operators
- Geographic pilot: Tuguegarao City, Cagayan. Location shown on UI only if supported by map provider; geofences and permitted road edges require city/TODA verification.
- Vehicle: motorized tricycle authorized for public hire. Each driver must be approved and assigned to one or more authorized TODAs according to verified rules; driver cannot simply self-claim affiliation.
- Jurisdiction model: one **city operating tenant** for Tuguegarao with TODAs as subordinate organizations. A driver has one active shift/dispatch domain. Future municipalities become distinct city tenants; city-wide superadmins can see only necessary aggregated operational data.
- Operations manual from existing TRISSEA project: verify ownership, continuity and approved operating policies, then map obligations into this product charter.

## Services, launch plan
| Service | Meaning | Initial release behavior | Status |
|---|---|---|---|
| Regular | Direct A→B exclusive request, no pooling | Full booking/payment lifecycle, immediate on-demand dispatch | **P0 build first** |
| Shared | Seats in compatible trip | Limited to configured, legally allowed routes and verified seats; only launch once pooled-engagement concurrency safe | **P1 gated** |
| Special | Whole-unit exclusive hire, optional stops/return | Initial direct trip can share Regular dispatch; multi-stop/return require approved rule and itinerary engine | **P1 gated** |
| Reservation | Passenger books TODA terminal pickup slot | Keep specification and APIs in design; no active passenger booking card until capacity/terminal rules confirmed | **Deferred** |

## Operating assumptions vs approval
- `ON_DEMAND` preferred for first 3 options, not based on TODA driver queue priority. A driver may accept on-demand jobs ONLY if TODA/MTOP authorization permits these pickups and routes.
- Terminal 'seat reservation' is a distinct operation: seated traveler presents themself at terminal; full-seats price for off-terminal pickup is a **candidate rule** only.
- No roaming beyond registered city or driver TODA/MTOP permitted zones; no assumption that all roads are tricycle legal.
- Admin may activate a ride type/zone/fare policy only after legal/operational approvals are attached.

## Passenger booking invariants
- Fare shown **before** Confirm; receipt and booking contain a versioned immutable fare snapshot.
- No quote if unsupported origin, destination, road restriction, unavailable legal pricing or service disabled. Client sees clear ineligible reason and alternative support instructions.
- Only one active exclusive ride per driver. A passenger gets one active ride in MVP; server rejects duplicates with stable idempotency keys.
- Booking can survive socket failure: polling/reconnect fetches authoritative ride snapshot.
- Shared seat limits from verified vehicle documents, not visual guesses or default `3`/`4` values.

## Pilot success gates (targets for engineering, not claimed performance)
Demonstrate 100% correctness for concurrent duplicate-accept and double-book tests; complete end-to-end cash booking on 2 actual Android devices; show safe no-driver, cancellation, network reconnect, driver restrictions, failed GPS, stale fare revision, wrong-TODA service-zone and wrong-user access flows. Measure p95 quote and dispatch latency under staged load; targets approved before launch.
