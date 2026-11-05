# React Native + Expo implementation standard (ADR-001)

**Status:** Accepted technology direction, not a functioning implementation. **Updated:** 2026-11-04.

## 1. Technology choice
- Use **React Native + Expo SDK + TypeScript** for both passenger and driver apps; **Expo Router** for file-based navigation.
- Maintain **separate passenger and driver native app identifiers** and release pipelines. Share only versioned common packages that do not contain role-specific credentials or policy logic.
- React + Vite continues to serve the administrative web application; NestJS/Fastify remains the only operational API authority.
- Prefer an Expo-managed workflow with config plugins and Continuous Native Generation (CNG). Introduce custom native modules only when documented device tests demonstrate a need.
- Do not pin unverified versions in documentation. At bootstrap, use a current compatible Expo SDK/React Native pairing; commit the lockfile after `expo install --check` and `expo-doctor` verification.

## 2. Folder conventions
```text
apps/passenger/         Expo Router, route groups, passenger features
apps/driver/            Expo Router, route groups, driver features
apps/admin/             React/Vite administrative UI
services/api/           NestJS HTTP/WebSocket APIs
services/dispatch-worker/   BullMQ + outbox workers
packages/contracts/     OpenAPI-generated TS types and clients
packages/design-tokens/ Shared versioned tokens (RN and web targets)
```

- `app/` route files should only compose feature screens. Put business behavior in `src/features/*` and network clients in `src/lib/api/*`.
- TanStack Query for fetched server state and invalidation; use small local UI state only where needed (e.g. Zustand), not as an authority for rides.
- Use `expo-secure-store` for auth-related secret material; local `expo-sqlite` may hold only necessary, retention-limited nonauthoritative drafts/telemetry. Never cache protected identity documents or plaintext credential stores.
- Generate API types from `contracts/openapi.yaml`; avoid duplicated hand-authored backend DTOs and client interfaces.

## 3. Native builds and MapLibre
- `@maplibre/maplibre-react-native` requires native compilation and an Expo config plugin; it is not available in Expo Go. Add it to both apps via `npx expo install` and configure its plugin, then rebuild Android and iOS clients.
- Verify **MapLibre package ↔ React Native architecture ↔ Expo SDK** compatibility as an explicit spike before implementing map-heavy screens. Follow the current MapLibre Expo integration guide; the newest library major version may require React Native's New Architecture.
- The public MapLibre demo tile service is not production infrastructure. Choose a suitable licensed maps/tiles provider for Philippines coverage and enforce attribution.
- For Windows development, use Android Studio + Android SDK + USB-enabled phone/emulator. Native iOS local builds require macOS/Xcode or an appropriate remote build workflow; do not claim iOS builds run locally on Windows.
- Use `npx expo run:android` for a local native development build. Use `eas build` only after the EAS project, credentials and cost model have been approved.

## 4. Background location and realtime
- Passenger app: on-demand foreground location with transparency and graceful manual address selection.
- Driver app: call `TaskManager.defineTask` in module top-level scope, request foreground permissions first, and use background location only for a documented active shift/trip purpose and with proper disclosure.
- For Android, evaluate `expo-location` with foreground service notification and applicable background location permissions in a **development build**, not Expo Go. Follow current Android and Google Play policy for foreground-service type and location permissions.
- `expo-location` does **not guarantee service continuation after a user terminates the app**. Battery optimizers and OEM behavior vary. If reliability gate fails, implement a dedicated native Android location component with service lifecycle and delivery buffering under an ADR.
- Do not permit concurrent tracking tasks or multiple driver presence sessions. Stop tracking and revoke presence on duty-end, account restriction, or explicit logout.
- Socket.IO events are hints, not write authority; always reconcile server state after reconnect or notification wake.

## 5. Network resilience for Philippine deployment
- Server stores ride status, offers, queue place and fare. Never fabricate ride acceptance when offline.
- Idempotency keys must be persisted across request retries and app restarts for an operation.
- Adaptive GPS sampling and heartbeat frequency should be tuned using field measurements on prepaid mobile plans; do not fix aggressive defaults before benchmarking.
- Test Globe, Smart and DITO SIMs where available, weak or intermittent mobile data, tunnel/building GPS loss, and low-end Android OEM policies.
- Driver UI must communicate **location stale**, **offer expired**, **connection lost**, **reconnecting** and **server-assigned** status distinctly.

## 6. Security and environment
- No client access to production database. Authenticate to NestJS API and validate token issuer/audience and tenant rights on server.
- `EXPO_PUBLIC_*` is public application configuration, **not** secret storage. Store confidential service keys exclusively on the backend or secure build infrastructure.
- Do not record raw tokens, precise GPS traces or phone numbers in analytics/crash logs; enforce privacy retention policy and purpose-based access.
- Use different bundle IDs, signing keys, push credentials and release channels for passenger and driver apps, and separate dev/staging/prod environments.

## 7. First executable acceptance gate
M1 must produce two independently installable Android development builds, a map screen that renders on a physical Android device, and documented background-tracking spike outcomes. Backend scaffold and database remain separate deliverables. Do not claim production tracking readiness until `23-EXPO-GPS-ACCEPTANCE.md` passes.

## Official references
- https://docs.expo.dev/guides/monorepos/
- https://docs.expo.dev/versions/latest/sdk/location/
- https://docs.expo.dev/versions/latest/sdk/task-manager/
- https://docs.expo.dev/develop/development-builds/introduction/
- https://maplibre.org/maplibre-react-native/docs/setup/expo/
- https://maplibre.org/maplibre-react-native/docs/setup/getting-started/
