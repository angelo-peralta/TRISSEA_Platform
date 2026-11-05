# Passenger app — React Native + Expo implementation slot

**M1 update:** the Expo Router shell now exists. From the repository root use
`pnpm.cmd dev:passenger` or `pnpm.cmd --filter @trissea/passenger web`. Android
development builds use `pnpm.cmd --filter @trissea/passenger android`.
See `../../docs/49-M1-FOUNDATION.md` for versions and pending native validation.
The original bootstrap proposal below is retained as historical guidance; do not
run create-expo-app over this implementation. All ride services are unavailable.

**Decision:** Expo Router + TypeScript; **scaffold not yet generated**. Driver and passenger remain separate installable apps with shared generated API types and design tokens.

## Initial scaffold (from a temporary directory)

```powershell
npx create-expo-app@latest trissea-passenger --template default
# Inspect and move the scaffold into apps/passenger without overwriting repository docs.
cd trissea-passenger
npx expo install expo-dev-client expo-location expo-secure-store expo-sqlite expo-notifications
npx expo install @maplibre/maplibre-react-native
npx expo run:android
```

- **Do not** run `expo run:android` until Android Studio/SDK, JAVA_HOME and Android device/emulator are ready.
- **Do not** use Expo Go for MapLibre, since it requires native code; use a custom development build.
- Add app identifiers, environment profiles, config plugins, secure API endpoint handling, and version-compatible dependencies before test distribution.
- Feature areas: identity, pickup/destination, quoting, booking, live-trip, receipts, safety, account. Use Expo Router for navigation and TanStack Query for server state.
- Passengers request foreground location only when justified; no always-on location tracking by default.
- Never expose a secret through `EXPO_PUBLIC_` environment variables; they are bundled into the app.

Read `docs/05-PASSENGER-FLOWS.md`, `design/SCREEN-INVENTORY.md`, `docs/22-EXPO-IMPLEMENTATION.md` and `AGENTS.md`.

## Four ride option cards
Regular, Shared, Special and Reservation must appear in the intended design system; feature flags gate unreleased/unauthorized services. Shared uses a separate pooled-booking experience. Special uses an ordered multi-stop/round-trip itinerary editor. Reservation uses a TODA slot workflow, not `/rides` directly; slot holder is confirmed as the passenger (ADR-008). See `docs/25-RIDE-OPTIONS.md`.

## Reservation route
Passenger-only TODA pickup windows (ADR-008). Implement terminal picker, slot availability, party+destination entry, hold timer, confirmation receipt, in-person QR/dispatcher check-in, fare consent, dispatch progress, assigned ride, no-show and unfulfilled recovery. No claimed driver assignment until server says `ASSIGNED`.

**Tuguegarao pilot v1.5:** See `docs/38-BOOKING-MVP.md`, `docs/41-AUTH-PRIVACY.md` and `docs/44-ADMIN-SCREEN-CONTRACT.md`. All fare rows remain draft/unverified. Only verified legal policies enable live bookings.
