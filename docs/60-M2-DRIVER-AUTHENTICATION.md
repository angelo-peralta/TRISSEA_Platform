# M2.4 — Driver authentication and pending identity intake

Status: **COMPLETE — LOCAL/SIMULATED BACKEND ENGINEERING ACCEPTANCE**.
Date: 2026-11-06 PHT. M2 as a whole remains IN PROGRESS.
Owner approved continuing after M2.3 `044ce8e`. This slice uses
`feat/m2-driver-auth`, stacked on that reviewed local commit. Fetched
`origin/main` remains merged M1 `553c5d7`; it has no commits missing from this branch.
The original planning checkout and its user changes are preserved.

## Implemented scope and files

- `services/api/src/auth/driver/`: protected driver endpoints, pending intake
  repositories and a pure identity eligibility policy.
- Existing `auth/passenger/` OTP, SMS, signing, session and consent code now
  accepts an explicitly bound mobile purpose. Its passenger defaults preserve
  the previous interface; there is one OTP/abuse-control implementation.
- `database/migrations/0005_driver_identity.*` and
  `services/api/src/database/driver-schema.ts`: seven constrained synthetic tables.
- MVP OpenAPI v0.7.0, generated backend DTOs and separate stateless passenger/
  driver transports. No new dependency, native module or architecture change.
- `scripts/test-driver-auth.mjs`, pure policy/token tests, transport tests,
  reproducible local setup and CI wiring. Prior M2.3 tests are pinned through 0004.

Authentication does not grant driving eligibility. The immutable mobile session
purpose and distinct JWT audience are checked by signature verification, current
database state and static route policy. A verified phone can have one global user
with separate passenger/driver personas. Passenger consent, sessions, refresh and
profile access do not become driver authority, or vice versa. Headers/payload
roles cannot override the authenticated purpose. Account restriction revokes both
contexts; logout/revocation affects only the selected purpose-bound session.

New drivers receive a PENDING profile and purpose-specific CONSENT_REQUIRED
session. They can acknowledge the synthetic notice/terms, inspect their own status
and submit pending requests for explicitly configured intake scopes. Phone proof
and consent never approve driver identity, membership, a vehicle or a permit.

`M2_DRIVER_AUTH_ENABLED=true` requires the shared passenger core flag, explicit
local-synthetic mode, separate driver audience and the disposable 0005 schema.
It defaults false. Production, live SMS and incomplete configuration fail closed.
M2.3 development limits remain shared across both apps; purpose cannot double the
destination/IP/device/global budget or bypass the shared resend cooldown. Redis
active proof is purpose-specific so a new driver challenge does not replace a
still-valid passenger challenge. No old proof is reconstructed after Redis loss.

## API contracts

All paths are under `/v1`. The shared phone request, verify and refresh bodies
accept PASSENGER or DRIVER. Challenge status defaults to PASSENGER for existing
clients; driver clients send `X-Client-Purpose: DRIVER` with their secret binding.
This anonymous flow selector is never accepted as authorization for a protected
request. Existing operation IDs are preserved, with documented generated driver
aliases for the four shared operations.

| Driver operation | Behavior |
| --- | --- |
| GET `/driver/me` | Own consent stage, PENDING/verification status and disabled capabilities |
| POST `/driver/me/consents` | Exact synthetic notice/terms, bound to DRIVER; no passenger inheritance |
| GET `/driver/auth/sessions` | Own driver sessions only, maximum 50 |
| POST `/driver/auth/sessions/{sessionId}/revoke` | Own driver session; another account or passenger session denied |
| POST `/driver/auth/logout` | Revoke current driver session and refresh credentials |
| GET `/driver/onboarding/options` | Active city, VERIFIED TODA and explicitly OPEN synthetic intake only |
| GET `/driver/cities/{cityTenantId}/todas/{todaId}/synthetic-vehicles` | Configured synthetic references; no real plate/document intake |
| POST `/driver/toda-affiliation-requests` | Create a PENDING request; no membership or role granted |
| POST `/driver/vehicle-relationships` | PENDING relationship bound to own affiliation and matching city/TODA vehicle |
| GET `/driver/verification-status` | Own requests/relationships only; no document links or other applicants |
| GET `/driver/cities/{cityTenantId}/todas/{todaId}/eligibility` | Current scoped synthetic identity evaluation, never operational approval |

Intake mutations require consent, safe UUID inputs and Idempotency-Key. Unknown
fields, including approval, capacity, plate/document data or role flags, are
rejected. Durable receipts bind actor, operation, key and canonical payload;
changed payload is 409. Account row serialization and unique constraints make
concurrent retries create one request/relationship. Replayed receipt returns the
current owned record without a second mutation. It does not reopen closed intake.
Lists are bounded to 50 and use owner/scope predicates.

POST `/driver/shifts`, POST `/driver/locations` and GET `/driver/offers` explicitly
return 403 for authenticated drivers in M2, including synthetic eligible fixtures.
Their future success contracts remain marked as design-only/M2 DENIED. There is
no location persistence, active shift, dispatch or ride-acceptance implementation.
No real-document upload, profile approval, generic driver-state edit or recovery
endpoint exists.

## Database and access boundaries

0005 creates `driver_profiles`, `driver_intake_scopes`,
`driver_toda_affiliations`, `driver_synthetic_vehicles`,
`driver_vehicle_relationships`, `driver_scope_assertions` and
`driver_request_receipts`. All use UUID references and UTC timestamptz. Scope FKs
bind city/TODA and user/affiliation/vehicle relationships; versions and explicit
states are checked. Receipts and subject/scope bindings are immutable. Every
verification/configuration record is constrained to SYNTHETIC_ONLY.

The operational login can INSERT only the subject/scope columns of a pending
profile/request/relationship, plus immutable receipts. It has no approval UPDATE,
intake/vehicle provisioning or assertion INSERT permission. Forced RLS requires
both owner and DRIVER transaction context for private driver records. Public
intake labels are explicitly configured SYNTHETIC labels; the metadata resolver
does not gain access to organization names or additional PII.

Eligibility reads use the existing authorization lock plus a narrowly scoped
`identity.lock_driver_context` SECURITY DEFINER function. Its owner is a dedicated
NOLOGIN/NOSUPERUSER/NOBYPASSRLS non-table-owner role, with a fixed
`pg_catalog,pg_temp` search path, no PUBLIC execution, no runtime SET ROLE access
and no returned data. Runtime connection validation rejects membership in that
owner role. It takes shared locks on the matched profile, intake, affiliations,
relationships, vehicles and assertion; current city/TODA/membership state is also
locked. Request security context comes from verified session/policy state and is
transaction-local. Future M2.6 writers must preserve the account-first lock order
and use reviewed transactional decision/version checks.

This follows PostgreSQL's documented [row-lock permission requirements](https://www.postgresql.org/docs/17/sql-select.html)
and [SECURITY DEFINER hardening guidance](https://www.postgresql.org/docs/17/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).
Tests verify the owner privileges, hostile context denial and a measured concurrent
downgrade waiting behind an eligibility read.

## Eligibility and verification handoff

The policy requires current account/persona/consent, verified unexpired driver
profile, active city membership, permitted current city/TODA, OPEN configured
scope, verified unexpired affiliation, vehicle and relationship, and a bound,
current synthetic permit/policy assertion. All subject/scope relationships and
referenced versions must match. Missing, suspended, expired, revoked, foreign or
stale facts deny eligibility. Capacity must come from a verified fixture record;
there is no guessed default or fare use.

`driver_scope_assertions` is a constrained **synthetic handoff**, not the M2.6
verification case/decision/document schema. Only the isolated migration/test owner
can create it. It stores opaque fixture references, versions and validity, never
an actual permit or legal checklist. Positive fixtures prove the policy can allow
identity eligibility; actual rows are reloaded from PostgreSQL on every evaluation.
No live driver approval follows from synthetic facts.

Every evaluation keeps `canGoOnline=false`, `operationalServicesEnabled=false`
and `realDriverApproved=false`, even when `identityEligible=true` with
`eligibilityBasis=SYNTHETIC_ONLY`. Operational capability cannot be enabled by a
caller, environment override, synthetic status or frontend button.

## Local setup and evidence

The existing ephemeral cluster remains on 15433/16380. M1's 15432/16379
infrastructure, databases and volumes are untouched. No database/volume deletion,
Redis flush or legacy SQL execution is used. Tests create new random disposable
databases; fresh/no-op/transaction-failure/down/reapply and populated rollback
preserve the 0001–0004 ledger, earlier users/sessions/audit/refresh and unrelated
sentinels. Down is disposable-only and is not an operational rollback procedure.

```powershell
powershell -NoProfile -File scripts/start-identity-test.ps1
pnpm.cmd contracts:generate
pnpm.cmd validate
pnpm.cmd test:driver:auth
pnpm.cmd test:passenger:auth
pnpm.cmd test:authorization:db
pnpm.cmd test:identity:db
pnpm.cmd install --frozen-lockfile
pnpm.cmd audit:dependencies
python scripts/validate_blueprint.py
pnpm.cmd driver:prepare
pnpm.cmd dev:driver:api
Invoke-RestMethod http://127.0.0.1:4101/v1/health
```

`driver:prepare` uses the existing setup helper with `--driver`; it creates a new
empty disposable DB through 0005, generated non-owner credentials, ignored keys
and ignored `.env.m2-driver`. It preserves existing passenger/driver environments.
The ordinary M1 API and previous passenger environment are not repointed or
migrated. No user, organization, vehicle, staff account or intake scope is seeded.
Prepared API startup was observed on loopback 4101 with health 200, bookings false
and unauthenticated driver profile 401.

`test:driver:auth` is the isolated non-public mock harness. It hosts the actual
root Nest/Fastify application, captures mock codes in process memory, uses real
PostgreSQL/Redis and drives all 15 generated driver transport operations. It never
prints/persists captured codes or credentials. No public mock reader exists.
Latest reports are ignored `.cache/m2-driver/`; accepted sanitized results are
linked from [the evidence folder](../evidence/m2/m2-4/README.md).

| Final command | Actual result |
| --- | --- |
| `pnpm.cmd validate` | Exit 0: reproducible contracts, lint, all seven workspace type checks, 82 API + 8 client + 9 repository tests, API/admin builds |
| `pnpm.cmd test:driver:auth` | 15/15 passed: real PG/Redis/root API, all fifteen driver transport operations, positive/negative eligibility and measured lock race |
| `pnpm.cmd test:passenger:auth` | 15/15 passed at the retained M2.3 migration boundary |
| `pnpm.cmd test:authorization:db` | 12/12 passed at M2.2 boundary |
| `pnpm.cmd test:identity:db` | 11/11 passed at M2.1 boundary |
| `pnpm.cmd install --frozen-lockfile` | Exit 0; no dependency changes or upgrades |
| `pnpm.cmd audit:dependencies` | Moderate threshold exit 0; one pre-existing LOW deepmerge advisory remains |
| Blueprint validator | Exit 0; documentation sanity check only |
| `driver:prepare`, `dev:driver:api` | New empty disposable database through 0005; loopback 4101 listened, health 200/bookings false, unauthenticated driver profile 401 |

Accepted command exits/timings and sanitized logs are in the evidence folder.
Driver cases additionally prove concurrent first passenger/driver verification
converges to one identity, shared destination cooldown, no cross-purpose consent/
refresh/session access, unchanged passenger login, persisted idempotency, real SQL
column/RLS/FK denials, strict version/scope binding, global restriction and Redis/
PostgreSQL outage denial. No passing result relies on an always-deny policy.

Failed exploratory runs are not accepted evidence. They found the initial intake read/lock privilege
error; the fix uses configured labels and the dedicated lock owner rather than
granting broad resolver reads or runtime approval updates.

## Remaining gates and review stop

Native Expo login/secure-storage/session-restore integration and actual Android
authentication acceptance remain M2.7 work, as recorded after M2.3. The separate
generated transports enforce purpose but deliberately persist nothing; no native
credential-storage or physical-device pass is claimed. Existing M1 previews are
unchanged. Keycloak OIDC/TOTP/browser acceptance is M2.5, not this slice.

Gates A–E remain closed: live SMS; real identity documents/privacy/retention;
actual driver/vehicle/TODA/permit authority; recovery/bootstrap/delegation; public
deployment. No approved business requirement, legal checklist or operating policy
was changed. Production key custody/rotation, limits/retry/lifetimes, retention
and capacity need review; one existing low dependency advisory remains tracked.
That advisory is deepmerge prototype poisoning `GHSA-gcqx-w48m-w2h4`; it predates
this slice. No unrelated dependency upgrade was introduced to hide the finding.
No push, PR, merge or deployment is authorized. Stop for owner review before M2.5.
