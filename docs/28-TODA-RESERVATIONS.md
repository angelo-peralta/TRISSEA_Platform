> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# TRISSEA Reservation — Passenger TODA Terminal Pickup Window (FINAL PRODUCT POLICY)

**Decision status: ACCEPTED by product owner on 2026-11-05 (ADR-008).** Reservation is **passenger-only**. A passenger reserves one future pickup window at an authorized TODA terminal. Drivers **cannot** reserve queue positions in this feature. Do not use or expose `DRIVER_CHECKIN_WINDOW` anywhere in production contracts or UIs.

**Operational status:** Product interpretation and safety invariants are final. Numeric schedules, fares and exceptional handling below are **proposed pilot defaults, not approved local ordinances**. Enable only for tenants with a signed policy for the relevant city/municipality, permits, routes, terminal and TODA. Follow official local tricycle regulations, not assumptions imported from Grab/TNVS.

## 1. What the passenger actually receives

- `RESERVATION` purchases or holds **access to a terminal pickup time window**, NOT a driver, vehicle, queue rank, fixed ETA, fare guarantee or immediate ride.
- Reservation `CONFIRMED` means one passenger party is counted against an authorized pickup window's quota.
- On valid check-in and fare/route confirmation, the platform may create a separate **terminal ride** and dispatch it from the existing eligible driver queue.
- The linked ride is a **Regular** private ride by default for MVP. Shared or Special may be offered only via an explicitly authorized, separately quoted conversion—not by automatically overloading Reservation semantics.
- The terminal's driver queue remains server-controlled FIFO with lawful eligibility/safety exceptions. Booking a passenger slot does not allow a driver to jump the queue.
- Reservation window is a service appointment target, not a guarantee of immediate pickup. Publish the wait/availability disclaimer, recovery and support policy clearly.

## 2. Actors and tenant boundaries

- **Passenger**: search slots, hold, confirm, cancel/reschedule, check in, consent to actual ride fare, view state.
- **TODA driver**: join a real physical-terminal queue via existing verified/geofenced shift process; receive normal offers; accept/start/complete linked rides. No remote queue-slot booking.
- **Tenant/TODA dispatcher**: publish eligible terminal windows and capacity, verify assisted check-in, resolve incidents, close slots and record audit reasons; cannot forge queue seniority.
- **Superadmin**: platform configuration/incident oversight only; tenant-scope enforcement still applies.
- Slots, reservations, offers and rides must share consistent `tenant_id`, `terminal_id`, route/service eligibility. Passenger may access only their own reservation; staff actions require explicit tenant role.

## 3. Exact passenger workflow

1. **Discover:** Passenger chooses Reservation, authorized TODA terminal, pickup landmark, destination/service zone and `partySize`; show time zone (PHT), capacity remaining and terminal instructions. Do not offer forbidden zones or unavailable terminals.
2. **Preview:** Show proposed pickup window, quota basis (booking parties), estimated fare or fixed approved fare if available, policy/version, permitted lateness, cancellation conditions, and disclaimer **'Pickup window reserved; driver assigned after terminal check-in and availability verification.'**
3. **Hold:** Authenticated passenger calls `POST /v1/toda/slot-reservations` with `Idempotency-Key`, `slotId`, `partySize`, destination/route and approved service code. Server locks slot, checks tenant/route, validates no conflicting active reservation, and consumes one party unit for a short TTL. Returns `HELD` and `holdExpiresAt` (DB clock).
4. **Confirm:** Passenger calls `POST .../{id}/confirm` before hold expires. Backend moves to `CONFIRMED`, snapshots disclosed rules, slot, party details and destination; issues reservation reference and optional reminder. No driver/ride exists yet.
5. **Approach:** Passenger may view status, navigate to terminal, cancel or reschedule under disclosed policy. If admin closes terminal, affected confirmed bookings must be explicitly notified and accommodated, rescheduled or cancelled under approved policy.
6. **Check-in:** Passenger arrives within configured check-in window. Validate authenticated reservation, in-person terminal QR/short-lived token OR dispatcher-assisted verification (optionally supported by geofence/accuracy; GPS alone is not proof). Transition `CONFIRMED -> CHECKED_IN` atomically and record verification method and actor.
7. **Quote and consent:** Verify route, destination, party size and legal fare. If price or service changed, obtain affirmative consent before dispatch. Create a valid `quotes` row and create the linked `rides` row using `mode = TERMINAL`, `ride_option = REGULAR`, and authenticated passenger context. Tie ride to reservation under one authoritative transaction/idempotent command.
8. **Dispatch:** Transition reservation to `DISPATCHING`, then search eligible drivers from the terminal's **existing** FIFO queue. Reserve an offer via existing dispatch worker. On atomic driver acceptance, mark reservation `ASSIGNED`, expose verified driver/vehicle details and start normal ride lifecycle. Late offer accepts fail safely.
9. **Fulfillment:** On verified passenger boarding/ride `IN_PROGRESS`, mark reservation `FULFILLED`. The linked ride continues independently through `COMPLETED`/incident handling. `FULFILLED` is not equivalent to payment or completed trip.
10. **Unfulfilled:** If no eligible driver or dispatch times out, transition to `UNFULFILLED` using configured service-recovery policy; provide clear notice, authorized alternatives, reschedule/refund if applicable, and audit event. Never fake an assignment or silently create on-demand fallback.

## 4. State machine

```text
AVAILABLE (derived from window inventory; NOT a reservation DB state)
       | hold, atomically
       v
      HELD --confirm before TTL--> CONFIRMED --verified arrival--> CHECKED_IN
       |                               |                               |
       v                               v                               v
     EXPIRED                       CANCELLED/NO_SHOW              DISPATCHING
                                                                       |
                                                 driver accepts ------+----> ASSIGNED
                                                                       |          |
                                                                no supply   ride starts
                                                                       v          v
                                                                  UNFULFILLED  FULFILLED
```

Terminal exception statuses: `REJECTED` for invalid/suspended requests, `RESCHEDULED` for a superseded reservation. Cancellation before dispatch follows the reservation policy; after a linked driver assignment, execute the **ride cancellation workflow** and synchronize reservation status to avoid ghost assignments. Terminal status and ride status are distinct aggregates; never rewrite terminal history to mimic a ride transition.

**Allowed transitions (server authoritative):**
- `HELD -> CONFIRMED | EXPIRED | CANCELLED | REJECTED | RESCHEDULED`
- `CONFIRMED -> CHECKED_IN | CANCELLED | NO_SHOW | RESCHEDULED | REJECTED`
- `CHECKED_IN -> DISPATCHING | CANCELLED | UNFULFILLED`
- `DISPATCHING -> ASSIGNED | CANCELLED | UNFULFILLED`
- `ASSIGNED -> FULFILLED | CANCELLED | UNFULFILLED` (only through coordinated ride cancellation/failure policy)
- `FULFILLED`, `EXPIRED`, `CANCELLED`, `NO_SHOW`, `UNFULFILLED`, `REJECTED`, `RESCHEDULED`: terminal; historical records remain queryable.

## 5. Reservation capacity and time windows

- A **capacity unit is one passenger booking party** for the MVP; passenger party size must fit an approved vehicle's actual seats. If the TODA approves multiple vehicles/types or group service later, define a separate capacity policy before switching to seat units.
- Capacity is an operator-published upper bound derived from planned terminal supply and operating hours. It must not blindly equal the number of online drivers or promise an exact pickup.
- Proposed **pilot configuration defaults only**: 15-minute window; hold TTL 3 minutes; passenger check-in opens 10 minutes before the slot and closes 10 minutes after its start; bookable 30 minutes to 7 days in advance; one active future Reservation per passenger per tenant; no automatic monetary reservation fee. Operator may change these after validation and publication.
- One reservation at a time per passenger per tenant until terminal/terminal-recovery state; user cannot hold multiple slots with multiple sessions.
- Server uses **PostgreSQL transaction + slot row lock** (`SELECT ... FOR UPDATE`) to enforce remaining quota. Under same slot lock, expire stale `HELD`s and count capacity-consumptive reservations. Recheck at final confirmation. Never use Redis counters as sole truth.
- `HELD` with server `holdExpiresAt <= NOW()` is inactive and must expire even if the cleanup worker is delayed. Idempotent retries do not allocate a second unit. Finished/assigned reservations **consume historical window capacity** so a serviced slot isn't resold inside the same window.
- `NO_SHOW` or authorized cancellation may free a window's quota only if terminal policy allows republishing it while enough time remains for a legitimate new passenger arrival.
- Admission control should stop accepting future windows after terminal closure, known driver supply failure, or infrastructure outage.

## 6. Driver queue and passenger fairness

- **Driver fairness:** choose the oldest `WAITING` terminal queue entry whose driver/vehicle/route/verification/geofence/shift is eligible; skip ineligible entries only for documented rules. Offer timeout/decline/rejoin behavior follows the tenant's approved queue policy. Reservation booking timestamp **must not** set or alter driver queue order.
- **Passenger fairness:** schedule checked-in reserved passengers by window start and checked-in time, with a published rule for walk-ins and accessibility needs. Any reserved-demand capacity should be accounted for in published terminal quota; do not secretly preempt already acknowledged walk-in services.
- Separate `reservation_confirmation_time`, `passenger_checkin_time`, `driver_enqueued_at`, `driver_offer_time`, and `ride_assigned_at` in events and metrics; they are not interchangeable.
- No guaranteed pickup ETA unless real-time availability supports a clearly labeled estimate. No passenger payment can buy driver queue seniority.
- If no driver is available, reservation remains `DISPATCHING` until a bounded timeout then becomes `UNFULFILLED`, with offered alternative options requiring passenger consent.

## 7. Administrative policies and exceptions

- Only approved tenant staff can publish slots, change quota or close terminals; every change needs actor, before/after, policy version, reason and audit log.
- Cannot lower a slot's capacity below already committed/consumed reservations. If severe disruption requires cancellation, execute an explicit incident recovery process rather than overwriting history.
- Staff check-in override requires authenticated tenant dispatcher + reason and optional supporting terminal token; no silent GPS bypass.
- `RESCHEDULE`: atomically place new slot hold and mark old confirmed booking `RESCHEDULED` within one transaction or leave the original intact on failure. Requote changes and obtain consent. Never double-occupy slots.
- `NO_SHOW`: server worker marks un-checked-in `CONFIRMED` reservations after published grace; notify and preserve dispute trail. No-show fee defaults to **none** until approved fare/consumer policies exist.
- `CANCEL`: before dispatch, release according to policy; after dispatch, cancel/expire offers and linked ride consistently, protecting driver queue fairness and cancellation policies.
- Offline: cached slot information is read-only; after reconnect fetch authoritative reservation status before sending a retry with the same idempotency key.
- Privacy: reservation reference is opaque; no passenger PII in broadcasts; access-controlled logs for exact location; reasonable retention documented in tenant privacy policy.

## 8. API and event boundaries

Read `contracts/openapi.yaml` and `docs/09-API-REALTIME.md`:
- `GET /v1/terminals/{terminalId}/slots?from=...&to=...` (eligible available pickup windows)
- `POST /v1/toda/slot-reservations` (hold for authenticated passenger)
- `GET /v1/toda/slot-reservations/me` (own reservations)
- `GET /v1/toda/slot-reservations/{reservationId}`
- `POST /v1/toda/slot-reservations/{reservationId}/confirm`
- `POST /v1/toda/slot-reservations/{reservationId}/check-in`
- `POST /v1/toda/slot-reservations/{reservationId}/dispatch` (server-validated quote/fare consent)
- `POST /v1/toda/slot-reservations/{reservationId}/reschedule`
- `POST /v1/toda/slot-reservations/{reservationId}/cancel`
- Staff slot publishing/closure: `POST /v1/tenants/{tenantId}/terminals/{terminalId}/reservation-windows` and `POST .../reservation-windows/{slotId}/close` (tenant staff role + policy approval + auditable reason).

Events: `toda.reservation_held`, `toda.reservation_confirmed`, `toda.reservation_checked_in`, `toda.reservation_dispatching`, `toda.reservation_assigned`, `toda.reservation_fulfilled`, `toda.reservation_expired`, `toda.reservation_no_show`, `toda.reservation_cancelled`, `toda.reservation_unfulfilled`, `toda.slot_capacity_changed`. Publish from transactional outbox with monotonic reservation sequence; clients handle duplicates and refresh snapshots after reconnection.

## 9. Required test matrix

1. Two passengers attempt last slot: exactly one hold succeeds; other gets `SLOT_FULL`.
2. Retries with same idempotency key: same reservation returned, including after network loss; mismatched payload rejected.
3. Expired hold vs confirmation at boundary: DB time wins, no excess capacity.
4. Same passenger uses two phones/accounts or retries: account uniqueness enforced; suspicious cross-account abuse rate-limited.
5. Missing route, forbidden route, oversized party, suspended TODA, closed window: blocked before hold.
6. Normal hold → confirm → check-in → fare-consent → valid linked ride → oldest eligible queued driver accepts → boarding → fulfilled.
7. Fake GPS, copied QR, forged tenant/terminal, invalid check-in window, unauthorized staff override: denied and audited.
8. No-show and cancellation around grace boundary, reschedule vs cancel race: exactly one authoritative terminal outcome.
9. Admin closure while active holds exist: stops new holds; follows notification and recovery, does not overbook/erase records.
10. No driver available / all offers declined: bounded dispatch, `UNFULFILLED`, alternatives without phantom ride.
11. Driver queue positions do not change merely because passenger makes or confirms a reservation.
12. Passenger/app restart restores state; server workers replay outbox without duplicate reservation or ride.
13. Cross-tenant passenger and dispatcher cannot view/alter other tenant reservation records.
14. Cannot cancel an assigned ride solely by flipping reservation status; linked ride and queue engagement reconcile atomically.
15. DST/timezone: store UTC; render Asia/Manila local appointment date/time; accurate sorting and cutoff.

## 10. External approvals still required

Product role is settled. Local operating details require **LGU/TODA/terminal signoff**, including legal tricycle category and route, terminal slot policy/capacity, guaranteed vs estimated service language, fair walk-in admission, cancellation/no-show, fare approval, insurance and operational support. Philippine tricycle service zones, fees, and MTOP are generally regulated by the city/municipality; see `docs/21-SOURCES.md`. This blueprint is not an operating permit.
