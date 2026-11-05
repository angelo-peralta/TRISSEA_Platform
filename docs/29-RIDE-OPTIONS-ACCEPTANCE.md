# Four service options — acceptance criteria and tests

| Option | Minimal end-to-end acceptance | Blocker |
| --- | --- | --- |
| Regular | One passenger quote→request→eligible driver offer→atomic accept→ride completion→receipt; late accept rejected | Duplicate assignment, stale GPS, wrong tenant, bad price |
| Shared | Two distinct passengers board same driver group; every route segment within seat limit; each receipt and state correct | Seat overbook, private/shared overlap, excessive detour, co-rider data exposure |
| Special | Exclusive unit with two stops and an optional return leg; server quote covers entire itinerary; unauthorized stop edit rejected | Silent repricing, invalid return route, passenger overlap |
| Reservation | Passenger holds last available TODA pickup window, confirms/checks in, consents to fare, receives an eligible FIFO driver or explicit UNFULFILLED; full audit/expiry/recovery | Overbooking, driver priority sale, phantom assignment, GPS-only bypass, fare change without consent |

## Critical race tests
- Last shared seat: two threads attempt a pool insertion; only legal combination commits.
- Driver accept: a Regular offer and Shared-group engagement cannot both win for one driver.
- Last TODA slot: parallel clients with different idempotency keys cannot exceed capacity.
- Duplicate retries: no duplicate ride or reservation on reconnect.
- Tenant confinement: driver or passenger cannot access another tenant's pool/slot.
- Terminal queue FIFO ranking unaffected by future slot booking unless approved policy changes.
- Shared rider cancellation does not cancel all other shared passenger bookings.
- Unexpected backend restart recovers offers, slot holds and outbox events without corruption.

**Quality gate:** No feature considered launched merely because a UI card exists. Require database tests, API contract tests, mobile reconnection tests, geographic service permission review, and an authorized pilot.
