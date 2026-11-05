# Driver Experience

## Enrollment
Authenticate → submit license/vehicle/authorization docs through secure signed upload → pending review → tenant admin verifies according to policy → eligible shift status available. Never allow document submission to auto-verify membership.

## On-demand shift
Select service/vehicle → enable location and notifications → go `AVAILABLE_ON_DEMAND` → send heartbeat and filtered positions → receive 15-second sample (configurable) offer with route, pickup distance, estimated fare and accept/decline → accepted ride continues to navigation and completion.

## Terminal shift
Select authorized tenant + terminal → arrive in check-in geofence and confirm shift → server adds `WAITING` queue entry and generates ordinal for display (displayed queue position may change when ineligible entries are skipped) → receive `PENDING` offer → accept → `CONSUMED` queue entry → pickup → trip → complete → optionally rejoin terminal at eligible geofence.

## Location service contract
- When shift is active or trip live, use foreground location updates with clear disclosure, user-visible indicator, and battery-conscious adaptive sampling.
- Native Android service integration must adhere to Android foreground-service/location permission policy; iOS uses approved background modes if supported.
- Publish `position`, `accuracy`, `speed?`, `heading?`, `capturedAt`, monotonically increasing sequence number; send GPS only with granted permissions.
- Backend rejects future/implausible timestamps, out-of-order sequence, bad accuracy (policy), unauthenticated updates and impossible jumps (flag review, do not silently penalize).
- Stop tracking after logout/off-duty except operationally necessary active trip recovery with user-visible disclosure.

## Network transitions
- Upload sparse buffered telemetry with bounded queue after reconnect; reject stale coordinates for matching.
- Driver offer expiry is server-authoritative; no accepting from offline local cache.
- On reconnect GET `/v1/drivers/me/assignment` and `/v1/rides/{id}`; reconstruct buttons from canonical states.
- Avoid consuming excessive battery while off duty; adjust GPS rate by status and motion.

## Safety
Passenger pickup confirmation policy (PIN or acknowledgement); visible driver cancellation reasons; in-app support and emergency call guidance; restricted drivers cannot revert restriction while ride active except privileged safe termination workflow.

## Service-specific differences
- Regular: accept exclusive ride and cannot accept concurrent private/shared requests.
- Shared: one active vehicle trip group may have multiple passenger bookings; show ordered stop/manifest, seat occupancy by leg, consent-safe limited passenger information, and independent pickup/dropoff acknowledgements. Do not implement until engagement locking and pooling tests pass.
- Special: show all agreed intermediate stops and round-trip leg; require approved amendment for route changes; whole unit cannot accept other passenger pickups.
- Reservation: **passengers** hold pickup windows; driver does **not** reserve a future queue position. Driver stays in the ordinary geofenced TODA FIFO queue, receives an offer after eligible passenger check-in, and accepts/declines using standard queue rules (ADR-008).
