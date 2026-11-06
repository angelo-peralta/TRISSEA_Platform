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
| D11 | Global user + city tenant / TODAs as organizations | ACCEPTED | Owner M2 directive 2026-11-05; ADR-011 | Local development approved; no city/TODA operating authority inferred |
| D12 | Phone SMS OTP + driver vetting, admin MFA | ACCEPTED | security owner | Mock local, configure production provider |
| D13 | Keycloak admin OIDC/password/TOTP; TRISSEA OTP + mock/PhilSMS transport | ACCEPTED | Owner M2 directive 2026-11-05 | Supabase rejected; live SMS and public deployment gated |
| D14 | Cash payments initially | ACCEPTED | city/TODA collections policy | Reconcile mock receipts |
| D15 | Commission/platform fees, fiscal receipt obligations | REQUIRES_LGU | legal/accounting | No fee enabled |
| D16 | Driver document verification + insurance/permit checks | REQUIRES_LGU | TRU/authorized operators | No unverified driver online |
| D17 | Data retention, PIAs, DPO/NPC obligations | REQUIRES_SECURITY | designated DPO/legal | No public launch |
| D18 | React Native + Expo; NestJS; Postgres/PostGIS | ACCEPTED | technical lead | Proceed with stack |
| D19 | Reservation = passenger terminal pickup window | ACCEPTED | product owner | Deferred from initial release |
| D20 | Existing TC-TRISSEA operations manual/data integration | REQUIRES_LGU | city/SPUP/DOST stakeholders | Do not overwrite existing system |

## Completion procedure
Decision owner attaches signed source/document and date; engineer opens ADR, changes policy config in controlled PR, updates tests and release checklist; city approval is not represented by developer ticking a checkbox.

## M2 planning proposals - 2026-11-05 (not approved)

Added only after M1 was pushed and draft PR #1 existed. These questions supplement
D11/D13/D16/D17; they do not amend accepted product requirements or authorize code,
provider activation, migrations, credential provisioning or real-data collection.
See [the M2 draft](52-M2-TECHNICAL-IMPLEMENTATION-PLAN.md) and
[approval matrix](54-M2-SECURITY-AND-ACCEPTANCE.md).

| ID | Decision needed | Status | Proposed owner/evidence | Until decided |
| --- | --- | --- | --- | --- |
| M2-P01 | OTP/rate/budget, password/session/reauth/retry policy and out-of-band revocation bounds | REQUIRES_SECURITY | Security owner + provider trial; candidate values in doc 54 | No real auth enabled with guessed/default-unlimited policy |
| M2-P02 | First-admin bootstrap, grant delegation, MFA/contact recovery and emergency access | REQUIRES_SECURITY | Project/security owners approve auditable authority and recovery procedure | No default admin, self-promotion or MFA bypass |
| M2-P03 | Phone recycling/linking, passenger/driver personas, session limits and future active-work handover | PROVISIONAL | Product/security owners + account takeover/recovery tests | No automatic identity merge or unsafe session replacement |
| M2-P04 | App JWT signer/refresh protocol and browser-cookie vault design, storage/key management and narrow new permissions | REQUIRES_SECURITY | Review draft ADR-011, processor/privacy evidence and threat tests | No unreviewed secrets/storage activation or sensitive-data endpoint |

The [additional accepted SMS planning ADR](51-ADR-SMS-PROVIDER-AND-MOCK-OTP.md)
selects PhilSMS as the initial transport candidate, TRISSEA-owned OTP/session
authority and mock transport locally/CI. It does not authorize real sending.
Account endpoint/sender/route pricing, carrier/portability, privacy and live
activation remain gated; Supabase is not assumed to own mobile OTP under this ADR.

## M2.0 owner architecture decision - 2026-11-05

The explicit M2 implementation directive supersedes the provisional D13 Supabase
proposal (preserved above in doc 41 history). D11/global verified identity + separate
personas and city/TODA scope is accepted; Keycloak is the only admin provider.
ADR-011 records accepted high-level interfaces and disposable migration strategy.

M2-P01: owner values are accepted **development defaults only**; production review
is still required. M2-P02 recovery/delegation remains REQUIRES_SECURITY (Gate D).
M2-P03 separate personas/no unverified-contact merge is ACCEPTED; recycling/linking
remains disabled. M2-P04 app sessions, asymmetric mobile JWT and BFF boundary are
accepted architecture; signer/library/key rotation, MFA assurance and retry behavior
require slice tests and production review. No legal/privacy status changed.

Unresolved: Gate A endpoint/sender/pricing/tax/carriers/spend/privacy/credentials;
Gate B notice/legal basis/storage/retention/incident/access; Gate C authorized
permit/vehicle/TODA/capacity/jurisdiction policy; Gate D bootstrap ownership, all
recovery and privileged delegation; Gate E deployment. No real driver documents,
real operator approval, recovery endpoint, implicit superuser or live SMS.

## M2.2 authorization review scope - 2026-11-05

Owner approved continuing after M2.1 local evidence. Work stays on a separate
stacked feature branch, with another review stop before M2.3. Current DB grants
and exact city/TODA/resource/assurance checks are authoritative; no caller role,
scope header, provider metadata or implicit platform PII bypass is accepted.
Conservative existing-vocabulary catalog edges are listed in doc 37 / doc 58.

| ID | Unresolved detail | Status | Until decided |
| --- | --- | --- | --- |
| M2-A01 | Narrow metadata-only permission for SECURITY_AUDITOR; future fare activation and GPS permission assignments | REQUIRES_SECURITY | No new audit-read permission or public endpoint; fare.activate/gps.read.live remain unassigned; no operational handler |
| M2-A02 | Current Keycloak factor assurance method and out-of-band revocation bounds | LOCAL METHOD IMPLEMENTED / PRODUCTION REQUIRES_SECURITY | M2.5 uses pinned required pwd+otp executions, signed AMR and current-factor/session/config reads; bounded in-flight proof is not a production distributed revocation guarantee; see doc 61 |

M2.2 does not approve Gate D role delegation/bootstrap/recovery, or any Gate A/B/C/E
activation. Synthetic assigned-case/fare resources test policy only; they are not
verification/fare features or legal approval.

## M2.3 passenger backend review scope — 2026-11-06

Owner approved continuation after M2.2. Development-only implementation selects
Ed25519/JOSE, opaque rotating refresh and 15-second encrypted original-request
retry; five distinct keys separate encryption, lookup, OTP, proof and refresh.
PostgreSQL retains authoritative budgets/redemptions/revocation; Redis proof loss
never rehydrates trust. Exact configurable bounds and actual local evidence are
in [doc 59](59-M2-PASSENGER-AUTHENTICATION.md). No contact/account linking,
phone replacement or recovery route exists.

| ID | Review detail | Status | Until approved |
| --- | --- | --- | --- |
| M2-P05 | Local 24h absolute session, 15s retry, 20 IP/hour, 10 device/hour + 20/day, 100 total/day and 30 verification/status/refresh IP/minute; signing/key custody and retention | DEVELOPMENT ONLY / REQUIRES_SECURITY for production | Runtime restricted to disposable synthetic mode; no hot digest/key rotation; review measured deployment capacity and interruption policy |
| M2-P06 | Synthetic notice/terms versions and native secure storage/login integration | LOCAL TEST FIXTURES / PENDING M2.7 | No real legal consent claim or mobile authentication acceptance |

Gates A–E and M2-P02 recovery/delegation remain unresolved. Backend local tests do
not approve live SMS, phone recycling ownership, legal notices, real documents,
driver operation, privileged provisioning or public deployment. Stop for review
before M2.4. No business requirement or legal/city/TODA decision was changed.

## M2.4 driver backend review scope — 2026-11-06

Owner approved continuation after M2.3. Driver login reuses the reviewed OTP and
rotating-session implementation with separate immutable purpose/audience and
consent. Pending intake requires an explicitly opened synthetic city/TODA scope;
it grants no membership, staff role or operating authority. The role vocabulary
and legal/verification requirements remain unchanged.

| ID | Review detail | Status | Until approved |
| --- | --- | --- | --- |
| M2-P07 | Synthetic pending driver/profile/vehicle records and version-bound eligibility assertions | LOCAL ENGINEERING ONLY | Only isolated owner fixtures may configure/approve assertions; M2.6 must implement reviewed case/evidence/decision workflows before real processing |

The positive synthetic eligibility test never approves a real driver: all results
keep `canGoOnline`, `operationalServicesEnabled` and `realDriverApproved` false.
Shift/location/offer endpoints deny server-side. Gates A–E remain closed;
production security values, key handling, retention and native secure storage
acceptance remain unresolved. See [doc 60](60-M2-DRIVER-AUTHENTICATION.md).
Stop before M2.5; no publication, deployment, recovery or privileged delegation.

## M2.5 administrator integration review scope — 2026-11-06

Owner approved continuation after M2.4. The selected local realm and BFF use real
Keycloak 26.8.2 password/TOTP, confidential Authorization Code + S256 PKCE,
required signed pwd+otp AMR, current identity/factor/session/configuration checks
and explicit internal mapping. Roles and scope remain PostgreSQL authority.
Cookie rotation, CSRF/Origin, local revocation/audit/outbox and bounded anonymous
flow budgets are implemented. No business, legal or driver-authority policy changed.

| ID | Review detail | Status | Until approved |
| --- | --- | --- | --- |
| M2-P08 | Local IdP read-service privileges, 1h absolute app session, 15m idle, 5m sensitive freshness, <=5s in-flight proof, 20/IP/min + 100/hour flow budgets | DEVELOPMENT ONLY / PRODUCTION REQUIRES_SECURITY | Reassess measured failure/revocation bounds, abuse limits, secret custody, provider hardening and retention before activation |
| M2-P09 | Real administrator invitation/bootstrap ownership, factor replacement and recovery | GATE D CLOSED | Only explicitly authorized isolated synthetic fixtures; no public registration, operational role delegation, recovery codes or reset shortcuts |

[Doc 61](61-M2-KEYCLOAK-ADMIN.md) records current test results and outstanding
checks. The implementation does not grant Gate A live sending, B real personal
data, C driver operation, D recovery/delegation or E public deployment. Current
stop is before M2.6; no GitHub publication was authorized for this slice.
