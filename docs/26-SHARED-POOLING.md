# Shared rides — pooling design

## Domain model
A `ride` belongs to one passenger/party; a **shared trip group** represents one driver/vehicle route and can carry several passenger rides. Do not interpret a single shared ride as the whole vehicle. The group holds capacity, sequencing and driver engagement; passenger rides retain independent fares, consent and support records.

## Candidate matching (policy-configurable)
1. Check operator authorization, service zone, vehicle seating/permits and pickup/dropoff service constraints.
2. Identify a live group or create a new group with an eligible driver/queue candidate.
3. Compute an **insertion** of new pickup and drop-off stops into the group's ordered manifest.
4. Reject if estimated capacity at any segment exceeds seats, if detours exceed approved percentage/minutes, or if any rider's max wait, pickup ETA or time window would be violated.
5. Requote deterministically using service policy and confirm the joining passenger's fare before reservation.
6. In one transaction lock the group/itinerary and current driver engagement, validate version and capacity again, append passenger booking, produce outbox event and update version.
7. On boarding and drop-off, update that passenger's lifecycle; complete the group only when the final rider has been discharged or the group is formally closed.

## States
Group: `FORMING → ASSIGNED → ACTIVE → COMPLETED` with `CANCELLED`/`FAILED` exceptions. Per passenger: `WAITING_PICKUP → PICKED_UP → DROPPED_OFF`, with cancellation/no-show rules. Existing `ride.status` remains a passenger-facing aggregate and needs an approved mapping from passenger group states.

## Capacity and pricing
- Occupancy is evaluated for every leg after each tentative route insertion. Do **not** implement only a shared-group seat counter; it is insufficient when passengers board/alight at different stops.
- Use a capped detour and wait policy with explicit notice. Shared fare is set by a versioned policy, not a guaranteed fixed discount percentage.
- One rider's cancellation must not silently alter other riders' agreed fare, destination, or pickup place.

## Dispatch safety
Current base migration's one-active-ride-per-driver unique index is designed for **private rides**. It must be replaced with a single authoritative driver-engagement lock spanning private rides and pooled trips before shared journeys can be enabled. See the non-production reference extension in `database/004_service_options_REFERENCE.sql`. Do not simply drop an index without an alternative guard and concurrency tests.

## Tests to pass before activation
Concurrent seat claim; impossible route insertion; 2+ riders with overlapping legs; one rider cancels but other continues; onboard vs booking-time seat availability; duplicate location/boarding event; private ride racing against shared group assignment; driver restricted mid-trip; tenant isolation; GPS offline recovery.
