# Implementation Order and Release Gates

## Non-blocking for coding / blocking for live pilot
- Can code locally now: authentication simulator, tenant/TODA permissions, map UI, driver-offer simulation, booking state machine, price policy editor, CSV import and unit tests.
- Cannot publish real payable rides yet: missing signed city fare policy/origin/whole-unit tariff; TODA and MTOP permissions; legally permitted road graph; driver verification process; privacy/consent; field-tested location/reconnect.

## Sequenced milestones
| Gate | Scope | Completion evidence |
|---|---|---|
| M0 | Tuguegarao pilot charter, ambiguity register, uploaded fare transcription, policy source review | Approved scope and assigned decision owners |
| M1 | pnpm monorepo + NestJS API + PostGIS + Redis + 2 Expo apps + admin + CI | repeatable Windows dev setup, API health and tests |
| M2 | Auth/MFA adapters, user/driver/TODA verification, tenant authorization | cross-TODA negative tests + no unverified driver online |
| M3 | Fare drafts/import/maker-checker/price policies + geographic checks | source provenance, self-approval blocked, approved-rule quotes only |
| M4 | Regular private ride vertical slice with simulated driver and cash receipt | two-device quote→offer→accept→start→complete with offline recovery |
| M5 | Legal routing and real driver GPS on physical Android | approved roads, battery/network trials, ETA and stale-location UX |
| M6 | Special direct, then approved stops/return with revision consent | complete itinerary/repricing concurrency QA |
| M7 | Shared only on approved corridors, verified seat capacity, one engagement | segment inventory and multi-passenger cancellation tests |
| M8 | Limited city/TODA pilot (after external approvals) | permits, privacy impact, incident drills, backups, load test, signed go-live |
| Later | TODA terminal queue and passenger Reservation | distinct future ADR and terminal operator approval |

## Branch + agent gates
Agent works one vertical feature per PR; no bulk-generated unreviewed production migrations. Every PR includes affected docs, OpenAPI contract delta, unit/integration tests, screenshot state review and threat checklist. No agent may independently change an approved fare, legal routing source or retention.
