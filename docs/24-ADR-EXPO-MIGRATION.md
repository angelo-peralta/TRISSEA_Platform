# ADR-007 — Adopt React Native + Expo for passenger and driver

- **Status:** Accepted by project owner, 2026-11-04.
- **Supersedes:** Flutter/Dart mobile direction in blueprint v1.0; also reflected in ADR-001.
- **Scope:** `apps/passenger`, `apps/driver`, shared frontend type contracts, mobile CI and build tooling.

## Context
TRISSEA requires reliable mobile GPS, maps and resilient booking UI while the team primarily develops in React/TypeScript. Native Android background location is a critical exception requiring direct platform-level validation.

## Decision
Use **React Native + Expo + TypeScript + Expo Router**, separate passenger/driver app identifiers and release pipelines, Expo development builds for MapLibre and location work, and Kotlin native modules when justified by device testing. The NestJS/React/Vite/PostgreSQL design remains unchanged.

## Alternatives
- Flutter/Dart: strong UI toolkit and mobile functionality but introduces an additional language/toolchain and does not eliminate native background location restrictions.
- Bare React Native: provides direct native control but raises day-one maintenance and build complexity; remains available through Expo prebuild/native modules.
- Web PWA: rejected for driver background tracking reliability.

## Consequences
- Update all mobile docs, agent instructions and bootstrapping prompts.
- Generate one shared TypeScript API contract for mobile/web, with server-enforced domain logic.
- Require Expo development builds, not Expo Go, for native MapLibre and background location.
- Test React Native/Expo/MapLibre compatibility before pinning dependency versions.
- Enforce app-level release safety, appropriate Android foreground-service/background location permissions and location disclosure.

## Migration status
Specifications revised; mobile app scaffolds and running implementation have **not** been generated or tested. Future implementation milestones must treat `docs/22-EXPO-IMPLEMENTATION.md` and `docs/23-EXPO-GPS-ACCEPTANCE.md` as mandatory.
