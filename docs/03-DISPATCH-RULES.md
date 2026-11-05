# Dispatch Rules — Contractual Invariants and Matching Strategy

## Service option versus dispatch mode
The official product options are `REGULAR`, `SHARED`, `SPECIAL`, `RESERVATION` (see `docs/25-RIDE-OPTIONS.md`). `ON_DEMAND`, `TERMINAL`, and consented `HYBRID_FALLBACK` are **dispatch strategies**, not ride options. Reservation is a separate TODA slot operation, not a `ride` status or a free pass to bypass the FIFO driver queue.

## Dispatch modes
`ON_DEMAND`: geospatial search, ETA/capability ranking.
`TERMINAL`: oldest eligible waiting queue entry for the requested terminal/route/vehicle class.
`HYBRID_FALLBACK`: on-demand or alternative-terminal result only after passenger explicitly accepts revised trip and fare terms.

## Driver status model
`OFFLINE`, `AVAILABLE_ON_DEMAND`, `QUEUED_AT_TERMINAL`, `OFFER_PENDING`, `ASSIGNED`, `ON_TRIP`, `SUSPENDED` (display states; server derives some from active offer/ride rather than persisting a loose boolean). A restricted or unverified membership is always excluded.

## Global invariants
1. One active passenger booking per passenger (initial policy); a driver holds one exclusive **engagement** (one private ride OR one pooled trip group), with at most one pending offer at a time across tenants. Multiple passenger Shared rides may link to one pooled trip only after its group-lock and segment-level seat accounting are enforced.
2. At most one pending offer per ride.
3. A driver has at most one active queue entry globally.
4. Only tenant-authorized active driver+vehicle+service+zone pairs are dispatchable.
5. A queue driver is not on-demand eligible unless the current tenant policy explicitly permits mixed supply; if so, reserve the queue entry first and define deterministic re-entry.
6. Server time determines expiry; client clocks are advisory.
7. Passenger acceptance is mandatory for a material service/price/pickup change.
8. All overrides include actor, reason, previous and new state, and trace ID.
9. Every write is scoped to both actor permissions and tenant context.
10. No background worker may reassign a completed, cancelled or accepted ride.

## On-demand candidate algorithm (MVP)
1. Validate ride `SEARCHING`, quote not expired/invalidated, service zone allowed.
2. Read nearby **fresh** positions with PostGIS `ST_DWithin` (e.g., initial radius configured 2–3 km, not hard-coded as product truth).
3. Join approved tenant membership, verified vehicle/service and recent-online heartbeat; exclude active rides, pending offers, queue reservation (default).
4. Pre-rank using approximate geodesic distance; request road ETA for a bounded shortlist; reject ETA failures or tag fallback estimate.
5. Rank by weighted pickup ETA + reliability + fair distribution (policy/versioned), never by sensitive demographic attributes.
6. Transactionally create time-limited offer. If uniqueness/lock fails, try next candidate.
7. On decline/expiry, append offer event, clear reservation and try next candidate/expanded radius within policy.
8. On exhausted candidates: no-driver result; show alternative only after new passenger confirmation.

## Terminal queue algorithm (MVP)
1. Passenger chooses terminal or authorized departure route; pickup is an approved loading point.
2. Validate terminal operating policy, service class, route, trip capacity and passenger arrival/boarding criteria.
3. Read eligible `WAITING` queue entries for terminal ordered by **queue `enqueued_at`, then UUID** (strict FIFO among *eligible* entries).
4. Lock queue entry (`FOR UPDATE SKIP LOCKED` on a bounded query) and driver assignment row, verify geofence/heartbeat/vehicle validity.
5. Reserve queue entry as `RESERVED`; create a single `PENDING` offer with deadline and outbox notification in the same DB transaction.
6. Accept → queue entry `CONSUMED`, ride `DRIVER_ASSIGNED`. Decline/expiry → queue policy: `RETURN_TO_HEAD`, `RETURN_TO_TAIL`, or `PAUSE` (operator-configured and audited).
7. If queue fails: notify passenger; fallback only by explicit passenger action.

## Concurrency algorithm pseudocode
```text
POST /rides (Idempotency-Key):
  BEGIN;
    check auth+tenant+quote;
    INSERT ride (unique active passenger index);
    INSERT ride_events;
    INSERT outbox_events;
  COMMIT;

WORKER offerCandidate(ride):
  select candidate outside transaction (shortlist only)
  BEGIN;
    SELECT ride FOR UPDATE; assert SEARCHING and no pending offer
    SELECT driver_profile FOR UPDATE; assert no active assignment
    for TERMINAL: SELECT queue_entry FOR UPDATE; assert WAITING; set RESERVED
    INSERT ride_offer(status=PENDING, expires_at=DB_NOW + policy_secs)
      -- partial unique indexes enforce single outstanding offer
    INSERT outbox_event
  COMMIT;

DRIVER accept(offer):
  BEGIN;
    lock ride, offer, driver, and queue entry in canonical order
    assert actor is driver; offer PENDING; expires_at > now(); ride SEARCHING
    assert driver membership and tenant constraints still pass
    UPDATE offer accepted; UPDATE ride assigned to driver (with guarded state)
    if TERMINAL set queue CONSUMED
    INSERT ride_event + outbox
  COMMIT;
```

## Fairness and abuse prevention
Measure queue skipped counts with reasons; freeze and audit admin manual assignment; GPS spoof warning and mismatch flags are not grounds for automatic permanent suspension. All rides have cancellation reason codes, tenant policy versions, and dispute pathways. Driver decline/retry consequences must be explicit, not hidden.

## Queue order and timeouts
Offer TTL, queue no-show timeout, grace period, allowed queue radius and requeue behavior are per-tenant, approved policy values. Example test defaults: offer TTL 15 s, heartbeat stale > 45 s, location stale > 30 s. These are **illustrative, not production-approved**.

## Recovery
Scheduled reaper reconciles expired offers, stale queue reservations, inconsistent driver states and outbox backlog. Must be safe to run multiple workers simultaneously; guard with locks, condition checks and idempotent events.

## Option-specific routing and matching
- Regular: ordinary private ride → road ETA ranking or authorized terminal queue FIFO; exclusive driver engagement.
- Shared: insert pickup/drop-off into existing compliant pooled group, or create a new group; test capacity on every leg, consent, wait and detour caps, and permit eligibility.
- Special: exclusive driver, versioned multi-stop/round-trip itinerary, no additional passenger matching, repricing and consent for changed stops.
- Reservation: passenger-only TODA pickup windows (ADR-008). Slot confirmation consumes capacity but does not assign a driver. After verified terminal check-in and explicit ride fare/route consent, create a linked terminal Regular ride and dispatch from the **existing FIFO queue**. No driver future queue-slot reservations or hidden priority.
- If vehicle is currently engaged in a Shared group, do not match it to Regular/Special. Terminal drivers must respect their current queue and policy in all modes.
