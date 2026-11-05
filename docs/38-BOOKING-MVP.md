# MVP Booking: Screens, States, API, Real-time and Recovery

## Minimum viable **functional booking** (v1 code target)
Deliver Regular on-demand booking end-to-end first; Shared/Special can appear only when their feature flags and pricing authorizations are active. This is not a claim they work today. Manual simulator for tests; real passengers cannot be charged until legal pricing and operator permits approved.

### Passenger flow
1. Open app → phone SMS OTP → account (name, phone, consent and notification permission requested contextually).
2. Choose pickup pin + street/landmark and destination. Backend validates city bounds, TODA/zone and **tricycle-legal** route. If unresolved, show "Cannot book this route yet".
3. Select `REGULAR`, `SHARED` or `SPECIAL` only if enabled for pickup/route. Show per-seat vs exclusive clearly; if Shared, prompt seats count; if Special, ordered stops/return if enabled.
4. `POST /v1/quotes` with server source and fare version; show validated fare breakdown, applicable discount and payment=CASH. Quote TTL and accurate time PHT.
5. `POST /v1/rides` with quote id and `Idempotency-Key`; server transaction creates `REQUESTED/SEARCHING`; background dispatch worker delivers offers.
6. Accept by eligible driver; passenger receives driver/vehicle masked details and safety help. Track location with `lastUpdatedAt` and refresh fallback.
7. Driver en route → arrived → pickup verification (server-challenge code or assisted) → in progress → completed; passenger sees cash amount/receipt and rating/help.
8. No driver, cancellation, price expired, GPS off, offline, stale location, driver restricted and unsafe route all have explicit safe states.

### Driver flow
Phone SMS OTP → KYC review (`PENDING`, `VERIFIED`, `RESTRICTED`, `REJECTED`) → verified vehicle and TODA membership → go online with permitted shift; app requests foreground location first and background only as justified. Receive offer with route/fare/accept timeout. Accept via server transaction; pickup verification → start → finish → mark cash collected with reconciliation event. No self-assigned ride, fake location or cross-TODA assignment.

### Driver offer algorithm (Regular)
Eligible if city/TODA and MTOP permit pickup/route, driver + legal vehicle documents verified, shift online and GPS fresh, not restricted, driver has no active engagement or pending exclusive offer; enough connectivity to receive offers. Filter spatially with indexed PostGIS, rank by road ETA / policy (not great-circle distance alone); offer one or batch according to city policy. Accept is one transaction; losing acceptance sees `409 OFFER_ALREADY_CONSUMED`. Driver may decline; retry after expiration; max tries/time then `NO_DRIVER_AVAILABLE`.

### Shared MVP gate
Not simply `two passengers same ride` — segment-level seat inventory and passengers' separate consent, fares, pickup/dropoff status and privacy are required. To simplify initial rollout use **preapproved shared corridors and fixed stop sequences only**; no arbitrary route insertion until separately tested. Check entire occupancy for concurrent booking, seat claim and driver engaged in one shared trip group.

### Special MVP gate
Start with exclusive direct trip on same engine as Regular; expose extra stops/round-trip only when approved pricing and itinerary transitions exist. Quote cannot show a fee if not deterministically computed. Reprice all changes and require renewed consent.

### State machine
Request `QUOTED → REQUESTED → SEARCHING → OFFERED (internal offer) → DRIVER_ASSIGNED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED`; terminal `CANCELLED/EXPIRED/FAILED/NO_DRIVER_AVAILABLE` according to a versioned transition table. Rejected/offline offers lead back to SEARCHING. Completed ride's fare snapshot immutable; cash can be reconciled separately.

### Realtime
Socket events `ride.snapshot.v1`, `driver.position.v1`, `ride.offer.v1`, `ride.status.v1`, `fare.policy.updated.v1` are **hints**, not authority. On reconnect, GET fresh snapshot, compare `version`, discard out-of-order updates, and allow polling fallback. At-least-once job handling via DB outbox + idempotency.

### Minimum API calls
Auth provider token exchange; `GET /v1/me`, `GET /v1/services/available`, `POST /v1/quotes`, `POST /v1/rides`, `GET /v1/rides/{id}`, `POST /v1/rides/{id}/cancel`, `POST /v1/driver/shifts`, `POST /v1/driver/locations`, `GET /v1/driver/offers`, `POST /v1/driver/offers/{id}/accept`, `POST /v1/driver/offers/{id}/decline`, `POST /v1/rides/{id}/transitions`, `GET /v1/rides/{id}/receipt`.
All write APIs require authentication, scoped authorization, server validation, rate limits, and appropriate idempotency keys. See the full design contract in `contracts/openapi.yaml` and MVP overlay `contracts/openapi-mvp.yaml`.
