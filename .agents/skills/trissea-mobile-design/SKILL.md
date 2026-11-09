---
name: trissea-mobile-design
description: Design, implement, debug or review TRISSEA passenger and driver React Native/Expo screens, navigation, accessibility, design tokens, map panels, offline/error states and native UI behavior. Use for mobile-facing work; not for unrelated database or backend-only changes.
---

# Mobile implementation — functional, accessible and trustworthy

Follow `AGENTS.md`, approved feature contracts and `design/DESIGN-BIBLE.md`. Keep frontend polishing secondary to functioning backend flows during M2.

## Inspect

1. Read `design/tokens.json`, `design/MOBILE-DESIGN-RULES.md`, component contracts, relevant flow (`docs/05-PASSENGER-FLOWS.md`, `docs/06-DRIVER-FLOWS.md`, `docs/28-TODA-RESERVATIONS.md`) and nearby tests/screens.
2. Confirm Expo SDK, Router conventions, native modules, build type, current API client types and actual permission behavior. Reuse shared components and design tokens rather than introducing a new UI kit.
3. Define user, purpose, primary action, server authorization and what happens when data is missing/stale. Avoid map-first decoration for authentication, consent or error screens where a map adds no value.

## Build and test

- Specify the applicable states: idle, loading, pending, empty, invalid, offline, expired, permission-denied, retrying and success. Prevent repeated actions and misleading optimistic confirmations.
- Native accessible labels, large-text resilience, adequate contrast, safe areas, keyboard handling, consistent hit targets, reduced motion and screen-reader focus matter more than visual effects.
- Present server-confirmed prices, queue position, driver identity, availability, reservations and ride status only. Cached values require clear stale indication and refresh/reconciliation.
- Respect PHT, PHP, landmarks, low-connectivity conditions and different Android sizes. Prevent OTP/secret/phone information from leaking to URL navigation, analytics, screenshots or logs.
- `RESERVATION` is passenger-owned TODA terminal pickup window, **not** guaranteed ride or driver queue rank. Shared/Special/Reservation services remain gated where backend or permissions are incomplete.
- Driver GPS/native permissions require custom development clients and `docs/23-EXPO-GPS-ACCEPTANCE.md`; Expo Go cannot prove production behavior.
- Run typecheck, mobile checks, applicable tests and manual ADB/emulator checks; real-device, iOS and native background-GPS acceptance require actual respective tests.

## Handoff

Report implemented screens and states, server assumptions, accessibility decisions, file changes, executed checks with results, visual/native test limits and remaining backend or approval gates. No speculative acceptance or copying proprietary ride-hailing designs/assets.
