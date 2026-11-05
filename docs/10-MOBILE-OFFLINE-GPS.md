# Mobile Reliability, Background Location, Offline UX

## Production priority
Driver-side location continuity is critical. React Native + Expo is the UI/client framework. Evaluate `expo-location` + `expo-task-manager` in a **custom development build**; Expo Go is not suitable for background location or MapLibre Native. Use a platform-native Android foreground service where field tests prove the Expo-managed solution insufficient. Never imply tracking continues after a user force-stops the app.

## Android implementation gate
- User turns on driving mode; explain location need and initiate approved service while foregrounded.
- Request runtime fine/coarse location appropriately; declare `foregroundServiceType="location"` and `FOREGROUND_SERVICE_LOCATION` when applicable.
- Determine whether `ACCESS_BACKGROUND_LOCATION` is required and permitted for this exact feature/target API; obtain Google Play approval where required.
- Persistent notification when service active; stop when duty ends; comply with foreground-service launch restrictions.
- Test Android 10 through current supported versions, OEM battery optimization, app swipe-away, process kill, low battery, cellular handoff, device restart, and GPS-disabled states.
- Define the Expo task at module top level and configure the `expo-location` config plugin and runtime permissions. Validate custom native builds; if service lifecycle is insufficient, implement a maintained Kotlin native module/Expo module with app-config integration, lifecycle tests, and explicit review.

## iOS gate
Use approved background location capabilities only when justified; test permission levels and foreground/background transitions on real iPhones. Do not assume Android behavior carries over.

## Telemetry guidance — starting hypotheses to measure
- Active ride: adaptive location samples (e.g., 3–5 seconds while moving, longer when stationary).
- Waiting driver: coarser updates (e.g., 10–20 seconds) plus heartbeat.
- Offline/off-duty: no ongoing active tracking.
- Each packet includes timestamp, GPS horizontal accuracy, sequence, heading/speed if available, source/device ID pseudonym.
- Backend refuses stale/out-of-order samples for assignment; store last-known fresh position in Redis and periodically snapshot if policy requires.

## Offline recovery
- Use `expo-sqlite` only for safe, retention-limited drafts and queued nonauthoritative telemetry; use `expo-secure-store` for small sensitive credentials/tokens. Never treat local cache as authoritative ride state.
- Queue **only safe, time-bounded nonauthoritative** operations locally: draft inputs, telemetry samples, log uploads.
- NEVER locally confirm new ride, offer acceptance, payment or driver assignment before server acknowledgement.
- On reconnect authenticate, call active ride/assignment endpoints, refresh quote, resubscribe and reconcile latest sequence.
- Retry requests with persisted idempotency key; never generate new key when retrying same create/accept command.
- Cache basemap tiles only where provider license allows; fail gracefully to address list and text directions if unavailable.

## Philippine network testing
Real-world testing matrix includes weak LTE/3G-equivalent conditions, Smart/Globe/DITO SIMs, indoor pickup points, crowded terminals, rainy conditions, cheap Android devices, and GPS drift in urban corridors. Assess costs/data usage, not just API latency.

## Reservation offline behavior
The Expo passenger app may cache upcoming window and reservation receipt for display only; online confirmation/check-in/dispatch requires the authoritative server and idempotency key. Never finalize check-in from the phone's GPS alone. Show time according to the operator's Asia/Manila schedule; on reconnect query `/v1/toda/slot-reservations/{id}` and refresh slot capacity before new hold.
