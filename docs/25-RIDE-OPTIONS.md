> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# TRISSEA — Official Ride Options (Decision ADR-007)

**Accepted product taxonomy, 2026-11-05:** `REGULAR`, `SHARED`, `SPECIAL`, `RESERVATION`.

This document supersedes older references suggesting only one ride service and excluding Shared or multi-stop features from the intended product. The **delivery sequence remains phased**: never misrepresent Shared pooling as implemented because a booking UI shows a Shared tile.

## Service type is NOT dispatch mode
- `rideOption`: what the customer purchases or requests.
- `dispatchMode`: `ON_DEMAND`, `TERMINAL`, or a specifically consented `HYBRID_FALLBACK`; controls how a driver is allocated.
- `RESERVATION` does **not** create an ordinary `ride` or `quote` until its slot has matured and an authorized workflow explicitly creates a ride. Reservation is a distinct resource.

| Option | Passenger label | Description | Allocation policy | Ownership / limits |
| --- | --- | --- | --- | --- |
| `REGULAR` | Regular | Quick private ride, A to B | On-demand or terminal | Exclusive active vehicle/driver assignment |
| `SHARED` | Shared | Lower-fare ride with compatible travelers | Approved terminal shared route or constrained pooling | Seat inventory, passenger-by-passenger manifests, detour and wait caps |
| `SPECIAL` | Special | Whole unit; optional ordered intermediate stops and round-trip | On-demand or terminal as allowed by permit | Exclusive vehicle, server priced stop/wait/return policies |
| `RESERVATION` | Reservation | Passenger pickup window at TODA terminal | Separate tenant-controlled reservation engine | Time window/slot holds/eligibility; must not alter driver FIFO by default |

## Business invariants
1. A vehicle is never simultaneously assigned to a `REGULAR`/`SPECIAL` private ride and a `SHARED` trip pool.
2. Multiple passenger `SHARED` ride records may belong to one driver-operated trip, but total onboard seats never exceed verified vehicle capacity; capacity must be tested for **every route segment**, not just at booking start.
3. All passenger manifests and fares remain private to their respective account; do not expose co-rider personal details.
4. Shared pickups cannot be added when they violate tenant detour, arrival-time, seat, permitted-route, or service/permit rules.
5. `SPECIAL` stops are an ordered server-validated itinerary; changing stops or round-trip status after acceptance requires repricing and renewed consent.
6. Reservation slot capacity is claimed under database row lock; `HELD` expires according to server time. Retrying a request with the same idempotency key never consumes another slot.
7. TODA FIFO queue membership remains governed by current queue rules. **A slot reservation must not automatically mean priority driver assignment or selling queue rank.**
8. Ride eligibility, driver verification, licensing, approved terminal routes, fare rules and incident handling remain tenant scoped.
9. Feature flags may hide options not legally or operationally authorized in the pilot area; no option should accept money or promises when unavailable.

## Reservation ownership — DECIDED (ADR-008)
**The passenger reserves a future terminal pickup window.** Confirmed on 2026-11-05. This is one passenger booking party against terminal slot quota, not a driver's future check-in or queue position. Driver queue assignments happen only after verified passenger arrival, fare/route consent, and an authorized dispatch transaction; no driver is assigned by slot confirmation. Driver reservation is out of scope. Numeric pickup window / fee details require TODA and LGU policy approval. See `docs/28-TODA-RESERVATIONS.md` and `docs/30-ADR-008-PASSENGER-RESERVATION.md`.

## Release order
- M3: Regular end-to-end.
- M4: TODA terminal queue core; Reservation passenger pickup windows after LGU/TODA operating policy approval.
- M5: Special ordered stops/round trip, pricing and consent.
- M6: Shared pooling, occupancy/route-segment validation, split passenger lifecycle and consent.

See `docs/26-SHARED-POOLING.md`, `docs/27-SPECIAL-ITINERARIES.md`, `docs/28-TODA-RESERVATIONS.md`, `database/004_service_options_REFERENCE.sql` and `contracts/openapi.yaml`.
