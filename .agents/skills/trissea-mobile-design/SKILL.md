---
name: trissea-mobile-design
description: Design, implement, audit or refactor TRISSEA passenger and driver React Native + Expo screens with a consistent transport-focused mobile UI, accessible native interactions, trustworthy booking status, and TODA reservation rules. Use for mobile UI, navigation, component, token, map or mobile usability work.
---

# TRISSEA Mobile Design — Project-Local Agent Skill

This skill is included in the blueprint and needs no third-party installer. It is an **original TRISSEA rule entry point**. It does not override `AGENTS.md`, an approved ADR, any safety invariant or the backend API contract.

## Before starting

1. Read `AGENTS.md`, `design/DESIGN-BIBLE.md`, `design/tokens.json` and `design/MOBILE-DESIGN-RULES.md`.
2. Read `design/MOBILE-COMPONENT-CONTRACTS.md`, `design/MOBILE-SCREEN-ACCEPTANCE.md` and the relevant feature flow (`docs/05-PASSENGER-FLOWS.md`, `docs/06-DRIVER-FLOWS.md`, `docs/28-TODA-RESERVATIONS.md` as applicable).
3. Inspect the existing app routes, shared components, Expo SDK and styling stack. Preserve existing architectural choices. Do not invent a new component library without approval.
4. If installed, consult official `expo-design-system`, `expo-native-ui` and `expo-router` guidance, then third-party community skills. Prefer live Expo docs on version-specific behavior.

## Design workflow

1. Write the screen's purpose, target user, primary action and what must be true on the server.
2. Define the view's information hierarchy and proposed component layout (map context vs actionable panel).
3. Specify normal, pending, loading, empty, expired, error, offline, permission-denied and stale states as relevant.
4. Use shared theme tokens, readable type scale, native touch targets and safe-area/keyboard rules.
5. Describe a real-device and accessibility QA plan before calling the screen complete.
6. Implement with typed React Native components, Expo Router and validated backend data.
7. Review against `design/MOBILE-REVIEW-CHECKLIST.md` and report actual tests performed.

## Non-negotiable boundaries

- Four services: **Regular, Shared, Special, Reservation**. Reservation is passenger-owned TODA pickup **window**, not driver queue rank or guaranteed ride. No driver future reservation UI.
- Queue position, fare, availability, driver identity, timing and ride state come from the server. No fabricated UI data represented as factual.
- Driver GPS and native location permissions follow `docs/23-EXPO-GPS-ACCEPTANCE.md`; Expo Go is not adequate for production GPS or native MapLibre validation.
- Designs must work in low-signal conditions in the Philippines, and support PHT, PHP, landmarks and assisted terminal check-in.
- Never copy Grab's imagery, layout, brand colors, logos or proprietary assets.

## Deliverable format

State: screen goal; hierarchy and component decisions; states and recovery paths; token/a11y notes; backend authority/consent checks; files changed; tests run (or not run); remaining constraints. Use `design/MOBILE-REVIEW-CHECKLIST.md` for handoff.
