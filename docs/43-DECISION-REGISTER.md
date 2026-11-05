# Decision Register — Tuguegarao Pilot

Use `ACCEPTED`, `PROVISIONAL`, `REQUIRES_LGU`, `REQUIRES_TODA`, `REQUIRES_SECURITY`, `DEFERRED`. "Accepted" here means team design intent unless explicitly cited legal authority.

| ID | Decision | Status | Proposed owner/evidence | Until decided |
|---|---|---|---|---|
| D01 | Tuguegarao City + tricycle-only pilot | ACCEPTED | project owner | Build for city |
| D02 | All TODAs can enroll but must be verified | ACCEPTED | city ops / TRU | No auto-approval |
| D03 | 42 area rates + ₱22/₱18 within poblacion | PROVISIONAL | signed city matrix/ordinance | Import DRAFT only |
| D04 | Origin/direction for outer-area matrix | REQUIRES_LGU | city fare office | No arbitrary route pricing |
| D05 | Legal full vehicle, per-seat and discount rules | REQUIRES_LGU | city fare office | No real regular/special fare quote |
| D06 | TODA off-terminal pickup = full seats/whole-unit | REQUIRES_LGU+TODA | TODA/City operator manual | UI shows unavailable until enabled |
| D07 | Regular on-demand private allowed across city | REQUIRES_LGU | city TRU/MTOP | Simulations only beyond approved zones |
| D08 | Shared per-seat corridors and boarding rules | REQUIRES_LGU+TODA | approved routes and seat docs | Disabled |
| D09 | Special stops/roundtrip charges | REQUIRES_LGU | tariff and waiting policy | Direct booking only in dev |
| D10 | Road restrictions including highway exceptions | REQUIRES_LGU | current road code + city GIS | Route gate blocks unsafe zones |
| D11 | Single city tenant / TODAs as organizations | PROVISIONAL | platform owner review | Build scoped model, ADR before migration |
| D12 | Phone SMS OTP + driver vetting, admin MFA | ACCEPTED | security owner | Mock local, configure production provider |
| D13 | Supabase Auth as provider | PROVISIONAL | vendor SMS coverage/cost test | Adapter-based implementation |
| D14 | Cash payments initially | ACCEPTED | city/TODA collections policy | Reconcile mock receipts |
| D15 | Commission/platform fees, fiscal receipt obligations | REQUIRES_LGU | legal/accounting | No fee enabled |
| D16 | Driver document verification + insurance/permit checks | REQUIRES_LGU | TRU/authorized operators | No unverified driver online |
| D17 | Data retention, PIAs, DPO/NPC obligations | REQUIRES_SECURITY | designated DPO/legal | No public launch |
| D18 | React Native + Expo; NestJS; Postgres/PostGIS | ACCEPTED | technical lead | Proceed with stack |
| D19 | Reservation = passenger terminal pickup window | ACCEPTED | product owner | Deferred from initial release |
| D20 | Existing TC-TRISSEA operations manual/data integration | REQUIRES_LGU | city/SPUP/DOST stakeholders | Do not overwrite existing system |

## Completion procedure
Decision owner attaches signed source/document and date; engineer opens ADR, changes policy config in controlled PR, updates tests and release checklist; city approval is not represented by developer ticking a checkbox.
