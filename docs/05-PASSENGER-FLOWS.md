# Passenger Experience

## Passenger service selection
Home screen presents **Regular**, **Shared**, **Special**, and **Reservation** as four clear cards. Availability is service-zone/tenant feature-flagged; unavailable offerings explain why instead of promising a booking. See `docs/25-RIDE-OPTIONS.md`.

## Standard on-demand
1. Open app, authenticate by phone/approved provider; explain GPS permission only when needed.
2. View map centered on last/current area, search pickup and destination; user can drag pin.
3. Select approved vehicle/service; request `/v1/quotes` to show PHP breakdown and estimated ETA with validity.
4. Press **Request ride**; show searching animation with cancel option and reconnection affordance.
5. Match assigned → show photo/name/vehicle/plate only as permitted, route-to-pickup, contact/safety actions, ETA and PIN/boarding details.
6. Driver arrived → prominent "Confirm vehicle and plate" cue; passenger boards; driver confirms pickup via approved policy.
7. Live trip → destination, location freshness badge, support button, emergency guidance.
8. Complete → server-generated price/receipt, cash amount, feedback and report issue.

## Terminal booking
1. Choose `Terminal ride` tab; select terminal + route/destination, seating or party size only if approved service supports it.
2. Show verified terminal name, approved boarding location, hours, fare basis, active queue estimate **clearly marked as estimate**.
3. Confirm terms and request; booking searches eligible queue. Passenger sees driver assignment and queue/boarding instructions.
4. Driver is reserved and accepts; show location and terminal meeting point.
5. Complete same ride lifecycle as on-demand.

## Fallback
If no eligible queue driver, show alternatives (another terminal, on-demand pickup or later ride). **Never silently switch fare, pickup, service/vehicle class, or legal operator.** Passenger reconfirms new quote and terms.

## UX failure handling
- No GPS permission → manual pickup entry remains possible within supported zones.
- Weak signal → preserve draft locally; submitting a request requires server confirmation. Show `Checking booking status` before retry; never assume request failed.
- Expired quote → refresh and reconfirm.
- No drivers → explicit unavailable message and alternatives; no fabricated ETA.
- Trip in progress on new login → resume canonical ride from server.
- Emergency → native call guidance using local emergency resources as validated for pilot; do not fabricate emergency integration.

## Shared booking flow (later milestone)
Select Shared → party size and approved pickup/drop-off → transparent lower-fare quote and allowed wait/detour → confirm → matchmaking into a legal route and seat-capacity-constrained pool → view only own booking and permitted driver/vehicle data → pickup check-in → ride → own receipt. Other riders' names/phones/location histories are not disclosed.

## Special whole-unit flow (later milestone)
Select Special → enter pickup, destination, optional ordered stops and optional round trip → verify versioned whole-unit fare and waiting policy → confirm → exclusive assignment → stop-by-stop trip → own receipt. Changes to stops/return leg require explicit revised fare consent.

## Reservation — passenger TODA pickup window (ADR-008)
Select Reservation → approved TODA terminal → pickup landmark/destination/party size → available date/time window → show quota, terms and **no preassigned driver** notice → hold (server TTL) → explicitly confirm → receive reference and check-in instructions → verify in person by terminal QR or authorized dispatcher during grace → confirm actual ride fare and route → dispatch through existing FIFO driver queue → show assigned driver and linked ride → normal boarding and completion. If no driver is found, explain `UNFULFILLED` and offer passenger-approved alternatives; never silently convert to on-demand. See `docs/28-TODA-RESERVATIONS.md`.
