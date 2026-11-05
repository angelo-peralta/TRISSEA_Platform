# Reservation — Transaction Boundaries, Atomicity & Reconciliation

This is engineering pseudocode, **not running application source**. Use `docs/28-TODA-RESERVATIONS.md` as product-policy source of truth. PostgreSQL is authoritative. No driver position is reserved when a passenger holds a slot.

## A. Create slot hold

1. Authenticate passenger and validate tenant/terminal/service/party/route; parse idempotency key and request digest.
2. Begin PostgreSQL transaction; claim idempotency record under unique `(actor_user_id, endpoint, idempotency_key)`. Reuse previous completed response if replayed; reject key with changed body.
3. Expire any stale `HELD` for this passenger that has reached DB-clock TTL (with necessary locking). If passenger already has an active slot in this tenant, return `ALREADY_HAS_RESERVATION`.
4. Lock chosen TODA slot row `FOR UPDATE`; check `OPEN`, valid appointment range, approved quotas and eligibility.
5. Under **same lock**, expire stale holds in that slot, calculate remaining booking-party capacity using states `CONFIRMED`, `CHECKED_IN`, `DISPATCHING`, `ASSIGNED`, `FULFILLED` and only nonexpired `HELD`. No oversell under concurrent holds.
6. Insert `HELD` reservation with passenger ID, party size, destination, `expires_at` from **database clock**, and policy version; persist audit+outbox and idempotency response atomically. Commit, then publish via outbox worker.
7. Abort and retry well-defined serialization/deadlock errors safely using the same idempotency key; never fall back to an unprotected Redis count.

### Holding SQL shape (illustrative only)

```sql
BEGIN;
SELECT * FROM toda_reservation_slots WHERE id = $1 FOR UPDATE;
-- Validate slot belongs to tenant and is open/bookable.
UPDATE toda_slot_reservations
SET status = 'EXPIRED', version = version + 1
WHERE slot_id = $1 AND status = 'HELD' AND expires_at <= transaction_timestamp();
SELECT COUNT(*) AS consumed
FROM toda_slot_reservations
WHERE slot_id = $1 AND (
  status IN ('CONFIRMED','CHECKED_IN','DISPATCHING','ASSIGNED','FULFILLED')
  OR (status = 'HELD' AND expires_at > transaction_timestamp())
);
-- Reject if consumed >= capacity, otherwise INSERT held reservation+audit+outbox.
COMMIT;
```

The exact lock order for multi-slot rescheduling and same-passenger concurrency must be tested using the constraints in `database/004_service_options_REFERENCE.sql` and deadlock-safe retry. An authoritative server-level transaction cannot be replaced with optimistic mobile state.

## B. Confirmation and check-in

- `HELD -> CONFIRMED`: lock reservation + slot, check DB TTL and slot availability, preserve policy snapshot, event and response.
- `CONFIRMED -> CHECKED_IN`: validate terminal verification credential and time window, staff role if assisted, route/party validity; prevent QR replay. Atomically record verification actor/method and event.
- No GPS-only check-in. QR codes must be short-lived, terminal-specific and validated by the server; staff-assisted alternative is necessary for poor data coverage and accessibility.
- Late/missed check-in is a server-controlled `NO_SHOW` transition after cutoff; never mutate previous audit events.

## C. Fare consent to terminal ride

- `CHECKED_IN`: passenger obtains current server quote with terminal + route + passenger + approved policy version. Do not make an ordinary ride from an unverified hold.
- On explicit fare consent, `POST .../dispatch` locks reservation, checks quote ownership, unexpired validity, terminal/tenant match, party size and `consentToFare=true`.
- Create exactly one `rides` row from quote (`ride_option=REGULAR`, `mode=TERMINAL`) and link reservation's `linked_ride_id`. Persist both updates, audit and outbox in the same DB transaction. Unique `linked_ride_id` and ride `quote_id` protect replay.
- Move Reservation `CHECKED_IN -> DISPATCHING`, ride to `REQUESTED/SEARCHING`; launch queue dispatch via outbox after commit.

## D. TODA driver matching and reservation completion

- Dispatch worker reads linked ride; use existing `terminal_queue_entries` in fair `WAITING` order, applying tenant, route, vehicle capacity, online shift, verification, geofence and engagement checks.
- Reserve single timed offer and queue entry under existing transaction rules; do **not** alter queue seniority because this was a passenger Reservation.
- Driver acceptance updates ride to `DRIVER_ASSIGNED`, reservation to `ASSIGNED`, terminal queue entry and engagement, ride/reservation events and outbox transactionally.
- On verified boarding and ride `IN_PROGRESS`, set reservation `FULFILLED` (terminal time-window obligation used). Ride may later complete/cancel independently.
- If no available driver after bounded attempts, mark `UNFULFILLED` with auditable reason and coordinate any linked ride cancellation/failure. Offer rescheduling or legal alternatives; never report `FULFILLED` before passenger boarded.

## E. Reschedule / cancel / closure

- For reschedule: lock passenger reservation and both old/new slot rows in a consistent order; atomically validate new slot, change old `RESCHEDULED`, insert new `HELD` under the same idempotent command. Roll back entire operation if any check fails.
- Once `DISPATCHING` or `ASSIGNED`, reservation cancellation must coordinate linked ride status, outstanding offer and queue/driver engagement. Do not merely set `CANCELLED` on the slot row.
- Closure stops fresh slot issuance immediately; impacted confirmed reservations require policy-driven remedy and notification. Never silently reduce capacity below confirmed/consumed reservations.
- Worker and mobile reconnect reconcile by DB aggregate version and event sequence. Outbox jobs may run more than once; transitions must be idempotent.
