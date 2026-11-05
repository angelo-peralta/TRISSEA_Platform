# TRISSEA Blueprint Changelog

## v1.4 — November 5, 2026
- New project-local React Native + Expo mobile design agent skill.
- New design rules, component contracts, screen acceptance matrix and review checklist.
- External source recommendations: official Expo skills, community Mobile Design, Vercel React Native guidelines; optional PowerShell installer.
- Integrated agent instruction entry points (`AGENTS.md`, `CLAUDE.md`, Cursor, Copilot); documented ADR-009.
- Preserved four service types and passenger-only TODA pickup-window Reservation from v1.3.

## v1.3 — November 5, 2026
- Finalized passenger TODA Reservation, backend authorization, slot holds, queue fairness and acceptance design.

## v1.5 — 2026-11-05 Tuguegarao City pilot
- Pilot location established; tricycles only, all verified TODAs eligible for scoped enrollment.
- Original two fare images preserved; transcribed 42 named-area rates plus poblacion ₱22/₱18 into unverified staging CSV with validation script.
- City fare admin design includes draft/import, signed evidence, independent approver, future effective date, audit and immutable quote snapshots.
- Added regional tricycle road restrictions / TODA pickup-seat policy uncertainty register.
- Regular direct on-demand first; Special and Shared gated; Reservation/terminal queue retained but deferred.
- Phone OTP passenger/driver, admin MFA, driver KYC, city/TODA RBAC and Philippine DPA readiness.
- Added separate design-only MVP OpenAPI overlay, SQL reference extension and acceptance scenarios.
