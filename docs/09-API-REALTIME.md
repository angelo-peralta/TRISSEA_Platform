# HTTP API and Realtime Contract

## Principles
- Versioned `/v1` HTTPS JSON endpoints; JSON error envelope `{code,message,traceId,details?}`.
- Bearer token validation at gateway/API; route authorization based on actor+tenant+resource ownership.
- `Idempotency-Key` required for ride-create, offer-accept, cancel, queue-join/leave and payment initiation.
- Pagination uses opaque `cursor`, not unrestricted offsets for active feeds.
- Server determines fare, user/tenant ID, queue position, timestamps and valid transitions.
- OpenAPI 3.1 reference: `contracts/openapi.yaml` (design contract; expand schemas during implementation).

## Endpoint inventory
| Method | Path | Actor | Purpose |
| --- | --- | --- | --- |
| POST | `/v1/quotes` | passenger | route + service price quote |
| POST | `/v1/rides` | passenger | create ride from active quote |
| GET | `/v1/rides/{rideId}` | party/authorized staff | canonical ride snapshot |
| POST | `/v1/rides/{rideId}/cancel` | passenger/driver/authorized staff | policy-controlled cancellation |
| POST | `/v1/rides/{rideId}/transitions` | assigned driver | en-route/arrived/start/complete |
| POST | `/v1/drivers/me/online` | driver | start shift/on-demand |
| POST | `/v1/drivers/me/offline` | driver | end shift, denied during trip except emergency policy |
| PUT | `/v1/drivers/me/location` | driver | authenticated, rate-limited GPS ingest |
| GET | `/v1/drivers/me/assignment` | driver | active offer/ride reconciliation |
| POST | `/v1/terminals/{terminalId}/queue/join` | driver | geofence checked join |
| POST | `/v1/terminals/{terminalId}/queue/leave` | driver | policy-controlled leave |
| GET | `/v1/terminals/{terminalId}/queue` | dispatcher/driver-safe view | filtered queue |
| POST | `/v1/offers/{offerId}/accept` | offered driver | atomic acceptance |
| POST | `/v1/offers/{offerId}/decline` | offered driver | decline with reason |
| GET | `/v1/tenants/{tenantId}/operations/rides` | tenant staff | filtered ride list |
| POST | `/v1/tenants/{tenantId}/operations/queue-overrides` | dispatcher | audited override |
| POST | `/v1/safety/incidents` | passenger/driver | safety case |
| GET | `/v1/health/live` | operations | process alive |
| GET | `/v1/health/ready` | operations | DB/queue readiness |

## WebSocket
Socket authentication on handshake and reauthentication on token rotation; server authorization before joining private rooms. Examples: `user:{userId}`, `ride:{rideId}`, `driver:{driverId}`, `tenant:{tenantId}:ops`. **Never** trust client-supplied room names without authorization.

### Event envelope
```json
{
  "eventId": "uuid",
  "type": "ride.assigned",
  "version": 1,
  "occurredAt": "2026-11-04T10:00:00Z",
  "aggregateId": "ride-uuid",
  "sequence": 8,
  "data": {"rideId": "ride-uuid", "status": "DRIVER_ASSIGNED"}
}
```
Events: `ride.status_changed`, `ride.offer_created`, `ride.offer_expired`, `driver.location_updated`, `terminal.queue_updated`, `safety.incident_created`. Client must tolerate duplication and missing events; reconnect fetches snapshot and optionally events after sequence.

## Error examples
`409 ACTIVE_RIDE_EXISTS`, `409 DRIVER_BUSY`, `409 OFFER_EXPIRED`, `409 INVALID_RIDE_TRANSITION`, `409 IDEMPOTENCY_PAYLOAD_MISMATCH`, `403 TENANT_SCOPE_DENIED`, `422 OUTSIDE_SERVICE_AREA`, `503 ROUTING_UNAVAILABLE`.

## Tracking privacy
Passenger can subscribe only to location of *their assigned trip driver* for the active trip and a short authorization window; never expose all available driver coordinates to passenger clients.

## v1.2 service option extensions (design only)
- `GET /v1/service-options?tenantId=...`: service catalog with authorization/availability flags, not a blanket promise to book.
- `/v1/quotes` now carries `rideOption: REGULAR | SHARED | SPECIAL`, party size and Special stop itinerary; Reservation has a different resource.
- `GET /v1/terminals/{terminalId}/slots`: read candidate TODA windows.
- `POST /v1/toda/slot-reservations`, `GET /v1/toda/slot-reservations/{reservationId}`, `POST .../cancel`: slot hold, lookup and cancellation; authenticated passenger role enforced by ADR-008; no driver future queue slot.
- Future Shared endpoints for pooled-group manifest/boarding are NOT ready for production until complete concurrency tests; do not expose co-rider personal data.
- Events: `toda.slot_held`, `toda.slot_confirmed`, `toda.slot_expired`, `shared.group_changed`, `special.itinerary_requoted`, versioned and tenant scoped.
See updated `contracts/openapi.yaml`; these are contracts, not running endpoints.

## v1.3 Passenger TODA Reservation (ADR-008; reference only)
- `GET /v1/terminals/{terminalId}/slots?from&to`: passenger pickup windows only, slot quota is booking-party units.
- `POST /v1/toda/slot-reservations`: create an expiring `HELD` passenger window (`slotId`, `partySize`, `destination`, `serviceCode`, `Idempotency-Key`).
- `GET /v1/toda/slot-reservations/me`, `GET /v1/toda/slot-reservations/{id}`: return owned, role-scoped reservation state; no public passenger roster.
- `POST /v1/toda/slot-reservations/{id}/confirm`, `.../check-in`, `.../dispatch`, `.../reschedule`, `.../cancel`: idempotent transitions with tenant/role checks and DB-authoritative state.
- `check-in` requires short-lived terminal verification or approved dispatcher-assisted check-in. Dispatch requires a validated current `quoteId` and passenger fare consent; output links to canonical ride.
- `UNFULFILLED` means terminal could not provide an eligible driver within the configured window; never silently switch to on-demand.
- Reservation event types are versioned in `contracts/realtime-event.schema.json`. Server publishes on DB outbox commit; clients refresh snapshots on reconnect.
- No `DRIVER_CHECKIN_WINDOW` is supported by these endpoints. Numeric capacity/time defaults in `docs/28-TODA-RESERVATIONS.md` require LGU/TODA approval.
