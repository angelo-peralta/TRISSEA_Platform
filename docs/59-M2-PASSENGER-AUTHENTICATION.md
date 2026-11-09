# M2.3 — Passenger authentication (backend slice)

> Current local Docker workflow: [ADR 66](66-ADR-DEVELOPMENT-INFRASTRUCTURE.md), one persistent `trissea-dev` project. Earlier container/Compose commands below are historical execution evidence, not startup instructions.

> Environment setup update (Task 5A): use [the canonical configuration guide](65-ENVIRONMENT-CONSOLIDATION.md). Legacy dotenv names/commands below are historical acceptance evidence, not current setup instructions. Existing files remain pending explicit cleanup approval.

Status: **COMPLETE — LOCAL/SIMULATED BACKEND ENGINEERING ACCEPTANCE**.
Recorded 2026-11-06, Asia/Manila. Owner approved continuation after M2.2.
Branch: `feat/m2-passenger-auth`, stacked on reviewed M2.2 `a6dcdb7` and
M2.1 `e83c335`; merged M1 baseline `553c5d7` remains intact. This is not M2
completion, mobile authentication acceptance, live SMS verification or production readiness.
Stop for owner review before M2.4. No push, PR, merge or deployment was performed.

## Implemented boundary

`services/api/src/auth/passenger/` contains challenge orchestration, SMS adapters,
Redis atomic state, Ed25519 application tokens, PostgreSQL sessions/rotation,
consent/profile operations, configuration and HTTP composition. The existing
global authentication guard stays fail-closed. M2.2 authorization evaluates own
account/session operations in the same transaction as their effects; caller roles,
scope headers and JWT role claims grant nothing.

The feature is absent unless `M2_PASSENGER_AUTH_ENABLED=true`. Enabled startup
requires `M2_AUTH_MODE=local-synthetic`, development/test, loopback infrastructure,
a random disposable database name plus matching manifest, a non-owner auth/resolver
login, and valid separately generated keys. The ordinary M1 environment remains
disabled. No production execution path, staff signup, driver-purpose login,
recovery, account linking, operational booking, dispatch, fare, GPS or real-document
handler is introduced. Unknown future endpoints remain unavailable.

| Implemented operation (under `/v1`) | Boundary |
| --- | --- |
| POST `/auth/phone/challenges` | PH mobile normalization, purpose/device/proof binding, durable budget reservation, mock delivery, 202 without code/contact echo |
| GET `/auth/phone/challenges/{challengeId}` | Opaque ID plus secret proof/device headers; no identity-existence result |
| POST `/auth/phone/challenges/{challengeId}/verify` | Phone + six digits + original client binding; atomic consume and authoritative redemption |
| POST `/auth/mobile/refresh` | Opaque credential + original client binding + idempotency key |
| GET `/auth/sessions` | Own passenger sessions, maximum 50; no credentials |
| POST `/auth/sessions/{sessionId}/revoke` | Current own-account policy; excludes foreign/driver sessions |
| POST `/auth/logout` | Revoke current session and its refresh credentials |
| GET `/me` | Own encrypted-name profile and current consent stage; operations always false |
| PATCH `/me` | Display name only; expected version and bound idempotency; no role/contact/state mutation |
| POST `/me/consents` | Acknowledge exact synthetic notice and accept exact synthetic terms; no legal approval claim |

MVP OpenAPI v0.6.0, generated backend types and the stateless passenger transport
are reproducible. The broad future `contracts/openapi.yaml` is unchanged.
Generated transport validates requests/responses, omits cookies, handles empty
204, supports cancellation and neither logs nor stores/retries credentials.

## OTP, SMS and abuse controls

- `crypto.randomInt(0, 1_000_000)` with six-character padding supports leading
  zeros. Distinct HMAC keys bind code, purpose, challenge, normalized destination
  and client proof. Redis stores hashes and counters, never plaintext phone/code.
- PostgreSQL stores keyed destination/IP/device digests and opaque binding
  metadata. Request reservation is serialized transactionally, survives Redis
  loss and counts attempts to send, including uncertain/failed sends.
- Redis Lua uses server time and atomic registration, rolling quotas, current
  challenge binding, attempt increments, lockout and single consumption. On
  consume, the OTP hash is removed. Redis loss cannot reconstruct OTP proof from
  database metadata; a later new challenge must satisfy the durable limits.
- Identical request retry returns its handle without sending again. Changed
  request under the same key conflicts. New accepted requests supersede old proof.
  A crash between reservation and send can leave a non-deliverable challenge;
  no automatic resend or plaintext OTP outbox is used.
- `MockSmsGateway` makes no network calls. The isolated test host captures
  messages only in process memory. No public mock-code endpoint, console print,
  file of codes or default fixed-code login exists. M1's simulator is not wired
  into these routes. A regular local API process deliberately cannot retrieve codes.
- `PhilSmsGateway` has a stub-tested potential transport interface. Runtime never
  selects it. It requires explicit approval configuration and injected transport,
  has a three-second timeout, forbids redirects and never falls back/retries.
  HTTP acceptance is not handset delivery. Current endpoint, sender, account,
  pricing/tax, spend/privacy and carrier trials remain Gate A requirements.

| Local development setting | Default / permitted bound |
| --- | --- |
| `OTP_DIGITS` | 6 only |
| `OTP_TTL_SECONDS` | 300 / 60–300 |
| `OTP_MAX_ATTEMPTS` | 5 / 1–5 |
| `OTP_RESEND_SECONDS` | 60 / 60–3600 |
| `OTP_HOURLY_LIMIT`, `OTP_DAILY_LIMIT` | 5, 10 / may tighten, never exceed these limits |
| `OTP_IP_HOURLY_LIMIT` | 20 / 1–20 |
| `OTP_DEVICE_HOURLY_LIMIT`, `OTP_DEVICE_DAILY_LIMIT` | 10, 20 / 1–10, 1–20 |
| `OTP_GLOBAL_DAILY_LIMIT` | 100 / 1–100 |
| Verification/refresh/status per source IP | 30/minute, atomic Redis rolling window |
| `MOBILE_JWT_SECONDS` | 600 / 60–600 |
| `MOBILE_SESSION_SECONDS` | 86400 absolute / 600–86400 |
| `AUTH_RETRY_SECONDS` | 15 / 1–30 |

These are initial, conservative engineering limits, not approved production
capacity or security policy. Source IP comes from the loopback peer with proxy
trust disabled; deployment proxy identity and distributed abuse controls require
review. Global reservation intentionally serializes sends at this small local
budget. Redis Cluster, failover and production load have not been accepted.

## Sessions, consent and privacy

Ed25519/EdDSA signing uses reviewed pinned `jose@6.2.15`, strict issuer/audience,
algorithm, key ID, `at+jwt`, required time/UUID claims, and no token-supplied key
URLs. Tokens contain internal IDs and passenger purpose, no phone or grants.
Every protected request also checks current database identity, account, persona,
auth version and session state. Restrictions trigger database-backed revocation;
refresh and authorization serialize with account restrictions.

Refresh credentials are random 48-byte opaque values; only keyed digests are
stored. Rotation locks account, session and credential, consumes one generation
and creates one successor. The same old credential, idempotency key, payload and
client proof may retrieve the identical encrypted result for 15 seconds, only
while its returned credential remains current. Different or out-of-window reuse
revokes the session/family. A wrong client proof cannot revoke another session.
The client must serialize refresh and reuse the same key after response loss;
this strict local policy can require reauthentication after an interrupted retry.

Redis produces a bound consume receipt; PostgreSQL's unique redemption creates
identity/persona/session transactionally. A DB outage after consume permits only
the original request to retry; it cannot create a second session. Verification
also requires the original challenge to remain unexpired. Short-lived encrypted
results are checked for expiry on every read; a bounded ten-second cleanup job
deletes expired results. Cleanup failure never extends authorization.

New users enter `CONSENT_REQUIRED`; `/me` exposes only synthetic notice/terms
versions. Acceptance activates the passenger persona/session but enables no
operations. These fixtures do not approve actual legal notices or consent basis.
Only a verified canonical phone maps to an existing phone identity; unverified
matching contact information and Keycloak identities are not merged.

Five distinct 32-byte keys separate AES-256-GCM encryption, identity lookup,
OTP hashing, coordination/proof digests and refresh digests. Generated Ed25519
private material and keys are ignored local files. Nothing secret is committed.
Local file mode is requested as 0600; Windows ACL hardening has not been certified.
No hot key rotation is supported: do not replace a populated database's lookup/
encryption keys (that could strand identities or create duplicates). Production
KMS, migration-aware digest rotation, key custody, backup/restore, retention and
revocation bounds require security review before activation.

Future native consumers keep access JWTs in memory and refresh/device/proof in
app-specific secure storage. This slice does not add native storage dependencies
or change Expo interfaces; secure storage, session restoration, Android login
and physical-device evidence remain integration work in M2.7.

Auth responses are `no-store`, errors are sanitized, bodies are limited to 16 KiB,
unknown fields are rejected and mixed cookie/bearer contexts are denied. Audit
and transactional outbox contain safe identifiers/events, not credentials or PII.
Profile RLS is forced and transaction-local; pooled contexts do not persist.
The auth login can access sensitive auth tables, but cannot grant roles, create
admin mappings, assume the policy-lock owner or own tables. Separate storage and
resolver role groups remain unchanged for other consumers.

## Migration and infrastructure

`0004_passenger_auth` adds only `phone_request_bindings`,
`mobile_session_bindings`, `auth_operation_results` and `passenger_profiles`.
Checks, indexes, composite session/user/purpose FKs, immutable request/binding
history and forced own-profile RLS match the Drizzle definitions. M1–M2.2
migration bytes and checksums remain unchanged. No user is seeded.

Tests create a fresh random `trissea_m2_test_<12 hex>` database in the ephemeral
M2 cluster (PostgreSQL 17.5/PostGIS 3.5.2 at 15433). Redis 7.4 at 16380 uses a
pinned official image digest, no persistence and a per-run namespace. M1's
15432/16379 services and volumes are untouched. No `FLUSHDB`, database drop,
volume removal or operational/legacy SQL execution is used.

Fresh migration, no-op, failed transaction, down and reapply preserve prior
ledger timestamps/checksums and an unrelated sentinel. Down removes these four
tables only; it is tested **only on disposable fixtures**. Once retained auth data
exists, disable the capability and review a forward repair; do not run down on
operational data. Earlier M2 acceptance tests stay pinned to their schema boundary.

## Reproduction and isolated mock harness

From the implementation worktree in PowerShell:

```powershell
powershell -NoProfile -File scripts/start-identity-test.ps1
pnpm.cmd install --frozen-lockfile
pnpm.cmd validate
pnpm.cmd test:identity:db
pnpm.cmd test:authorization:db
pnpm.cmd test:passenger:auth
pnpm.cmd audit:dependencies
python scripts/validate_blueprint.py
pnpm.cmd passenger:prepare
pnpm.cmd dev:passenger:api
Invoke-RestMethod http://127.0.0.1:4100/v1/health
```

`passenger:prepare` creates a new empty disposable database, generated non-owner
login, ignored `.env.m2-passenger` and ignored key file. It preserves an existing
environment; never prints secrets or substitutes the M1 database. These tmpfs
databases disappear with cluster recreation. Preserve configuration until a
reviewed new disposable environment is prepared; do not regenerate keys against
an existing populated database.

`test:passenger:auth` is the non-public mock development harness. It hosts the
actual root Nest module/Fastify API in process, injects only the SMS capture and
isolated infrastructure, and drives all ten HTTP contracts with the generated
client. It captures codes and credentials solely in process memory and reports
only safe pass/fail evidence. Run it to exercise the functional login flow;
there is deliberately no externally accessible code reader. Development clients
are not connected to this harness in this backend slice.

## Executed evidence and defects corrected

See [accepted evidence](../evidence/m2/m2-3/README.md). Latest machine reports
remain under ignored `.cache/m2-passenger/`; accepted snapshots are sanitized.

| Check | Actual result |
| --- | --- |
| `pnpm.cmd validate` | Passed: contract regeneration, lint, all 7 workspace type checks, 5 client tests, 49 API tests, 9 repository regressions, API/admin builds |
| `pnpm.cmd test:passenger:auth` | 15/15 passed with PostgreSQL, Redis, non-owner login, actual root app and generated client |
| `pnpm.cmd test:identity:db` | 11/11 passed at M2.1 boundary |
| `pnpm.cmd test:authorization:db` | 12/12 passed at M2.2 boundary |
| `pnpm.cmd audit:dependencies` | Exit 0 at moderate gate; one existing LOW advisory remains |
| `pnpm.cmd install --frozen-lockfile`, blueprint validator | Both exit 0; reviewed lock reproducible and documentation sanity check passes |
| `passenger:prepare`, `dev:passenger:api` | New empty disposable DB; standalone API listened at 127.0.0.1:4100; health 200 with bookings false; unauthenticated `/me` 401 |

The real tests include valid/invalid/expired/reused OTP, five-attempt lock,
concurrent send/consume/refresh, bound retries, cooldown and hourly/daily/IP/device/
global budgets, verified-account convergence, consent gating, encrypted profile
CAS, cross-account denial, own-session revocation, restrictions, RLS pool cleanup,
JWT negative proofs, leakage checks and Redis/PostgreSQL transport failures.
Post-consume DB failure is an explicitly injected failure at that boundary, not
a claim of a distributed failover test. Synthetic fixture time advancement tests
windows without weakening runtime settings or waiting a day.

Initial tests caught and corrected: new-session `last_seen_at` could precede
`authenticated_at` because defaults use transaction time; both are now set from
one server timestamp. Exhausted challenge status now reports expired instead of
pending. Schema consistency checks also aligned Drizzle FK names with actual SQL.
Test fixture timestamp/serialization issues were corrected; failing runs were
not accepted as evidence. No Android/browser, physical-device, live carrier or
Keycloak MFA acceptance is claimed here. The unchanged low advisory remains an
explicit concern, not a clean-audit claim.

The remaining advisory is `deepmerge` prototype poisoning,
`GHSA-gcqx-w48m-w2h4` (LOW; patched range >=4.3.2). It predates this slice;
no unrelated dependency upgrade was performed. The only new direct dependencies
are pinned `jose@6.2.15` and official `@redis/client@6.3.1`, reviewed against the
Node 22.17 runtime and verified with a frozen install.

## Remaining review gates

Gates A–E remain closed: live SMS; privacy/legal real-data procedures; actual
driver/vehicle/TODA authority; recovery/bootstrap/delegation; public deployment.
Production key handling, rate/lifetime/retry policy, data retention and capacity
need review. M2.4 driver context and pending-verification work requires the next
owner approval. Keycloak runtime/MFA is M2.5, verification M2.6 and Android/browser
integration/security acceptance M2.7. No automatic continuation beyond this slice.
