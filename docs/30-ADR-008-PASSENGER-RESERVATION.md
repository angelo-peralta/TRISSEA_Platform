# ADR-008: TODA Reservation belongs to passengers — ACCEPTED

- **Date:** 2026-11-05
- **Status:** Accepted product/architecture decision; operating figures provisional until TODA/LGU approval.
- **Decision owner:** TRISSEA product owner (explicit confirmation).

## Context
The product defines four ride options. `RESERVATION` was ambiguous in v1.2 because it could mean a driver checking into a terminal queue or a passenger reserving a pickup window. Driver queues must remain fair and compliant with terminal operating rules.

## Decision
- The **passenger** reserves a future pickup window at an authorized TODA terminal.
- A Reservation is separate from `rides`; it is never a driver queue place or preassigned tricycle.
- Booking consumes one passenger-party quota unit, with server-controlled hold, confirm, check-in, route/fare consent, and eventual linked terminal Regular ride.
- Driver assignment occurs only through the existing TODA queue after passenger verification and dispatch request. Queue rank cannot be purchased or modified by passenger slot reservation.
- Driver-reserved future queue check-in windows are **out of scope and prohibited from this API**. A separate ADR and separate product feature would be necessary to introduce them.

## Rejected alternatives
1. Driver reservation — rejected by explicit product-owner selection.
2. Slot confirmation immediately assigns a driver — rejected due to double-booking and queue fairness risk.
3. Passenger reservation bypasses FIFO — rejected absent a separately authorized policy.
4. Free-form time requests without slot quota — rejected because supply capacity would be unbounded.

## Consequences
- Mobile passenger Reservation screen only; no driver Reservation creation screen.
- `slotKind = PASSENGER_PICKUP_WINDOW` constant (or remove discriminator after migration); no public `DRIVER_CHECKIN_WINDOW` values.
- Add passenger confirmation/check-in/dispatch/reschedule endpoints, reservation status events, capacity audit and link to `rides`.
- Existing v1.2 SQL/OpenAPI are **reference artifacts**; review/replace with v1.3 design before any real deployment. No silent in-place production migration is supplied.
- Numeric TTL, grace, quotas and fees in `docs/28-TODA-RESERVATIONS.md` are proposed pilot defaults, **not approved TODA rules**.

## Source of truth
`docs/28-TODA-RESERVATIONS.md` is normative; `docs/25-RIDE-OPTIONS.md` and `docs/03-DISPATCH-RULES.md` describe domain interoperability, `contracts/openapi.yaml` is the design interface, `database/004_service_options_REFERENCE.sql` is a reference schema, and `AGENTS.md` enforces agent behavior.
