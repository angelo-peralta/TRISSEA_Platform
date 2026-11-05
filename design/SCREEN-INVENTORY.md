# Screen Inventory and Wireframe Requirements

| App | Screen | Primary contents | Critical states |
| --- | --- | --- | --- |
| Passenger | Welcome/Auth | sign-in, trust/copy | OTP failure, rate limit |
| Passenger | Home map | pickup/destination, four service cards: Regular/Shared/Special/Reservation | GPS denied, map fail, option unavailable |
| Passenger | Service details | option features, service eligibility, dispatch policy | unsupported vehicle/zone |
| Passenger | Shared selection | seat count, pickup/dropoff, wait/detour policy | pool unavailable, capacity full |
| Passenger | Special itinerary | ordered stops, return leg, whole-unit fare | route invalid, reprice required |
| Passenger | TODA pickup reservation | terminal/landmark, slot date/time, party size, destination, hold/confirm, QR/staff check-in, dispatch result | slot full, expired, late, closed, no driver |
| Passenger | Quote | fare components, pickup, service, expiry | fare invalid, route fail |
| Passenger | Searching | status, safely cancel, connection | no-driver, offline |
| Passenger | Driver assigned | driver card, vehicle/plate, ETA, safety | position stale, driver cancels |
| Passenger | Live trip | route and status, share/support if permitted | location delayed, incident |
| Passenger | Receipt | amount PHP, payment state, rating | dispute/payment issue |
| Driver | Verification | docs, review state, vehicle | rejected/restricted |
| Driver | Shift | on-demand/terminal selector, location | permission denied |
| Driver | Terminal queue | entry, estimated position, pause/leave | stale geofence, reserved |
| Driver | Incoming offer | route, fare, TTL, accept/decline | expiry, offline |
| Driver | Active ride | pickup/navigation, state actions | passenger no-show, cancellation |
| Admin | Operations | tenant-scoped KPIs, active rides/map | outage/stale telemetry |
| Admin | Terminal details | queue, drivers, overrides | permission denied |
| Admin | Driver review | docs, vehicle, approve/reject | conflict, expired document |
| Admin | Fare & zones | versioned rates, map polygons | invalid overlap, unapproved |
| Admin | Incidents | severity, evidence refs, action log | restricted access |

For each view build: low-fi layout, interaction prototype, semantic/a11y tree, error copy, analytics event definition and mobile data consumption budget.


*Reservation is passenger-only (ADR-008). Driver UI shows normal TODA FIFO offer and active trip, never a driver reservation form.*
