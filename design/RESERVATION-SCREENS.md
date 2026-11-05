# TRISSEA Passenger Reservation — UI and Copy Specification

**ADR-008** · Passenger-facing mobile app (React Native + Expo Router). No driver Reservation booking screen.

## Passenger screen flow

| Screen | Key elements | Primary action | Notable errors |
| --- | --- | --- | --- |
| `reservation/terminal` | List/map of approved TODA terminals, service areas, hours, pickup landmark, accessibility | Choose terminal | Terminal closed/outside service area |
| `reservation/slots` | Date picker, 15-minute pilot example windows in PHT, remaining **booking-party** slots, terms and service disclaimer | Choose window | Window full, stale quota, disabled schedule |
| `reservation/details` | Destination/route, passenger party size, permitted fare estimate, cancellation/check-in policy version | Hold for 3 minutes (pilot) | No eligible vehicle; oversized party; bad destination |
| `reservation/confirm` | Held countdown from server `expiresAt`, terminal and window, term acknowledgement, no driver assigned notice | Confirm pickup window | Hold expired; new fare/terms version |
| `reservation/receipt` | Opaque reference, terminal, date/time, pickup instructions, check-in window, cancel/reschedule | Navigate to terminal | Rescheduled/closed by TODA |
| `reservation/check-in` | Live status, approved terminal QR verification or staff-assisted fallback, optional GPS hint | Check in | Too early/late; invalid/expired QR; network offline |
| `reservation/fare` | Exact terminal route + approved current fare, confirmation flag, no passenger data beyond own booking | Confirm fare & request driver | Quote expired; changed route/fare |
| `reservation/searching` | Driver search and timeout status, clear cancellation/recovery options | Wait/Cancel | No eligible driver; outage |
| `reservation/assigned` | Linked ride status, authorized driver and vehicle identifiers, safety actions | View ride | Driver cancels/retry |
| `reservation/unfulfilled` | Apology, no-driver explanation, permissible alternatives and support | Choose new window or approved fallback | No alternative available |

## Exact copy requirements

**Before confirm:** "You're reserving a pickup time window at this TODA terminal. A driver will be assigned after you check in, subject to availability."

**After confirm:** "Pickup window confirmed. No driver has been assigned yet. Arrive at the terminal and check in during your permitted window."

**No drivers:** "We couldn't assign an available TODA driver for this pickup. Your reservation has not become an active trip. You can choose another time or contact support."

**No-show warning:** "Please check in before [PHT cutoff]. After that, this reservation may be marked as a no-show."

**No paid queue priority:** Never say "Skip the line", "Reserved tricycle", "Guaranteed driver" or "Instant pickup" for this option. Capacity, walk-ins and estimated pickup behavior depend on approved TODA rules.

## UX constraints

- Server timestamps are UTC; show Philippine local PHT with date, e.g. `Nov 6, 2026, 9:00–9:15 AM (PHT)`.
- Slot availability must refresh on foreground/reconnect; selecting a visible slot is not a guarantee until confirmed.
- Every state screen has a persisted idempotency key for pending writes, immutable reference for receipt, and canonical server refresh.
- Do not put QR token in logs, analytics, link previews, deep links or notification bodies. Support readers and assisted check-in.
- Show user-friendly error mapping: `SLOT_FULL`, `HOLD_EXPIRED`, `ALREADY_HAS_RESERVATION`, `CHECKIN_WINDOW_CLOSED`, `CHECKIN_VERIFICATION_FAILED`, `QUOTE_EXPIRED`, `NO_ELIGIBLE_DRIVER`, `TERMINAL_CLOSED`, `TENANT_SCOPE_DENIED`.
- Accessibility: 44pt minimum touch targets, semantics, text scaling, high contrast, offline feedback; no QR-only mandatory path.
