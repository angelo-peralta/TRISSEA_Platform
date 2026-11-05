# Mobile Booking UX — Specific Screens and Safety Patterns

## Passenger: initial navigation
Tabs: **Home**, **Activity**, **Account**. Home shows map + pickup/destination + service selector. Services: Regular (Private), Shared (Per seat), Special (Whole unit), Reservation (TODA terminal—"Coming later" if disabled). No button may imply a service works when disabled. Fare panel contains legal fare basis, currency/discount, clear total, payment cash and quote expiry.

## Driver: initial navigation
Tabs: **Home**, **Trips**, **Earnings**, **Profile**. Status: Offline, Verifying, Online, Offer received, En route, Arrived, On trip, Restricted. Driver sees current TODA affiliation and vehicle, location permission/freshness, appropriate offers, larger touch buttons (≥44pt); incident/help action. No on-demand requests before verification.

## Passenger booking recovery
- No GPS: manual landmark entry where legal; do not make up pickup accuracy.
- No service/route: explain unavailable, allow pin change or support.
- No fare rule: "Fare not available for this route" instead of displaying an unapproved guess.
- SMS delayed: cooldown/resend limits, alternate support/recovery; avoid account enumeration.
- Driver no longer available: return to searching and display reason; no duplicate charge.
- Weak signal: show last known status and timestamp; keep cancel/retry safe and idempotent.
- Cash-only: clearly say "Pay the driver in cash" and receipt records whether confirmed paid or disputed.

## Mobile design invariants
Use Expo Router, native navigation behavior, dark/light-ready tokens, large high contrast prices, 3G/slow-network loading, bottom-sheet map controls, legible type in sunlight, screen reader labels and cancellation confirmation. Never create fake driver dots, ETA, reviews or pickup promises.
