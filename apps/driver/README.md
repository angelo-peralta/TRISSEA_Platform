# Driver app — React Native + Expo implementation slot

**M1 update:** the separate Expo Router shell now exists, with development-client
configuration. Run `pnpm.cmd dev:driver`, or `pnpm.cmd --filter @trissea/driver android`
to compile/install a native development build. No driver shift, GPS or offers are
enabled. See `../../docs/49-M1-FOUNDATION.md` for pending native validation.
The original scaffold proposal below is historical; do not overwrite this app.

**Decision:** Expo Router + TypeScript using a custom development build; **scaffold not yet generated**. The driver app must be validated on real, inexpensive Android phones before live operations.

## Initial scaffold (from a temporary directory)

```powershell
npx create-expo-app@latest trissea-driver --template default
cd trissea-driver
npx expo install expo-dev-client expo-location expo-task-manager expo-secure-store expo-sqlite expo-notifications
npx expo install @maplibre/maplibre-react-native
npx expo run:android
```

- Add `@maplibre/maplibre-react-native` and `expo-location` config plugins to `app.config.ts` / `app.json` with the required native settings; rebuild after changes.
- Define background location tasks at module top level using `TaskManager.defineTask` and register/unregister them deliberately with shift lifecycle.
- Request location permission progressively; use an Android foreground service/ongoing notification as platform and store policies require; never track off-duty.
- No promise of GPS collection after app force-stop; respect OS/background restrictions.
- Never let an offline accept or queued operation confirm a server-authoritative assignment.
- If proof-of-concept tests fail, document an ADR for a custom Kotlin Expo module or another native solution.

Features: enrollment, shift/availability, terminal queue, offers, active trip, earnings, safety, diagnostics.

Read `docs/06-DRIVER-FLOWS.md`, `docs/10-MOBILE-OFFLINE-GPS.md`, `docs/22-EXPO-IMPLEMENTATION.md`, `docs/23-EXPO-GPS-ACCEPTANCE.md` and `AGENTS.md`.

## Service implications
Driver UX needs exclusive Regular/Special assignments; eventual Shared passenger manifest and seat/stop management; and tenant-managed TODA queue controls. Reservation check-in is done by the passenger. Drivers remain in the normal TODA terminal queue; no driver reserved-slot functionality is planned (ADR-008). See `docs/25-RIDE-OPTIONS.md`.

## Reservation behavior
Drivers do not reserve queue slots in TRISSEA Reservation. Their app stays in the normal terminal shift/queue/offer workflow. A passenger checked-in Reservation may generate a terminal ride offered to the oldest eligible TODA queue driver. See ADR-008.

**Tuguegarao pilot v1.5:** See `docs/38-BOOKING-MVP.md`, `docs/41-AUTH-PRIVACY.md` and `docs/44-ADMIN-SCREEN-CONTRACT.md`. All fare rows remain draft/unverified. Only verified legal policies enable live bookings.
