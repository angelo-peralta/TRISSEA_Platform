# M2.2 authorization implementation and local acceptance

Date: 2026-11-05. Status: **COMPLETE - LOCAL/SYNTHETIC AUTHORIZATION ENGINE ACCEPTANCE**.
Owner approved continuing after M2.1. Stop before M2.3; no publication, merge,
deployment, production authentication or external service activation.

## Scope and baseline

`feat/m2-authorization` is stacked on reviewed M2.1 `e83c335` in sibling worktree
`TRISSEA_Platform_m2_identity`. Fetched `origin/main` remains M1 merge `553c5d7`.
Original checkout/user edits and the M2.1 branch are preserved. No reset, stash,
rebase, remote/identity change or push. Stacking retains the reviewed dependency.

New `services/api/src/auth/policy` files implement typed server action policies,
current-record Drizzle queries, validated settings, transaction/audit enforcement,
Nest DI, static route metadata and an interceptor with private request context.
Migration `0003_authorization` adds catalog edges, metadata-only SQL roles/RLS and
a hardened row-lock function. Tests and CI exercise both M2.1 and M2.2 boundaries.
The old M1 authorization examples are marked deprecated.

No new production HTTP routes, tables, JWT/cookie verifiers, SMS gateways,
verification/fare workflows or frontend changes. OpenAPI/generated clients stay
unchanged. Synthetic HTTP probes live only in the test script, use `app.inject`
without a listening port, and are not packaged application controllers.

## Identity and policy boundaries

The existing global guard still binds `DenyIdentityProvider`. The new module binds
`DenySessionProofVerifier` and an unavailable database by default. No fixed OTP,
environment-selected test principal, caller role or decoded bearer JSON bypass.
Only isolated test-process DI overrides mint synthetic proofs. M2.3/M2.5 must
implement actual JWT/Keycloak/cookie verification; this is not cryptographic,
OIDC or real MFA integration acceptance.

Every decision reads current user/identity/session records, exact purpose and
binding, auth-version match, account/stage, expiry and persona/admin mapping.
Consent-stage passenger/driver sessions may read only their own minimal account
and session shell. Driver identity never grants operating eligibility.

Scoped actions require ACTIVE account/session, ADMIN/Keycloak context, approved
mapping, stored MFA and a matching current-factor assertion from the trusted
verifier. Idle defaults to 900 seconds; sensitive actions require credential and
MFA verification younger than 300 seconds. Refresh is not reauthentication.
The validated configurable settings apply stricter values and reject values above
development ceilings. Current production/live-SMS/document/recovery/operational
activation fails configuration validation. No live assurance is minted here.

`role_permissions` joins each assignment individually. Permission, role, membership,
city/TODA, effective window and revocation must match the **same row**. No permission
cache or scope union. Action-specific role caps retain the approved matrix even
if an incompatible DB edge is mistakenly added. Ownership and assignment are
loaded by server resource adapters, never caller owner/scope fields.

Verification/support/privacy policies require the real assignee. Verification
rejects self-review. Fare approval requires a known different maker, even when an
account holds editor and approver roles. Valid resource version, city and TODA
state are required. PLATFORM scope grants explicit infrastructure access only.
See [the exact catalog mapping](37-ROLE-ACCESS-MATRIX.md). Missing narrow auditor
permission remains pending M2-A01; no new permission is invented.

## Database, audit and concurrency

M1/M2.1 tables, migration ledger/checksums and existing records are preserved.
No people, organizations or user grants are seeded. The migration adds:

- A NOLOGIN/non-owner/NOBYPASSRLS resolver with metadata-only column grants,
  own-subject RLS and INSERT-only audit access. No encrypted subject, refresh
  material, organization-name access or role mutation.
- A separate NOLOGIN/non-superuser lock-function owner. App logins cannot assume
  it. Narrow UPDATE grants are confined to that role for PostgreSQL row locking.
- `identity.lock_authorization_context`: SECURITY DEFINER with fixed
  `pg_catalog,pg_temp` search path, qualified relations, bound user/session/city/
  TODA, no dynamic SQL or returned private data. PUBLIC execute is revoked.

The service uses READ COMMITTED and transaction-local context, reloads resource
scope/version and locks relevant account/identity/session/mapping, city/membership/
TODA/grant rows. A shared lock protects the small role-permission catalog from
concurrent edits. Normal readers can run together; production contention/capacity
has not been benchmarked.

Two-connection tests observe grant/session revocation waiting for earlier
authorized work; following requests see the revoked state. This is serialization,
not cancellation of an already serialized transaction. Time-based checks run
again before commit; expiry rolls back effects and the provisional ALLOWED audit.

Audit records bind current DB actor/session, authoritative scope/resource, action,
trace and safe reason. Failed audit prevents the handler. Failed work rolls back
and records DENIED separately; raw SQL/provider errors are redacted. Unavailable
DB/audit authority denies access. No external, streaming or provider side effects
inside the transaction: future handlers must use its supplied transaction and
their own domain/idempotency rules.

RLS/settings are trusted-server defense, not protection from arbitrary SQL or a
compromised DB credential. Application adapters exist only for ACCOUNT, SESSION
and TODA. Case/fare/config positives use synthetic test-only tables/adapters;
M2.6 still needs actual verification storage, state machines and acceptance.

## Migration execution and evidence

Only new random manifest-marked `trissea_m2_test_<12hex>` databases are migrated in
the existing ephemeral PostGIS test cluster, loopback 15433. M1 PostgreSQL/Redis
(15432/16379), databases and volumes are not reset, stopped or migrated. Existing
disposable-mode safeguards remain required; no legacy reference SQL.

Tests cover apply/no-op, failed commit, rollback/reapply, earlier ledger identity,
unrelated sentinel, retained users/grants/audit and explicit column-grant revocation.
Down uses no CASCADE and removes this migration's known function/policies/grants/
catalog edges only. NOLOGIN groups remain. Retained-data environments need a
separately approved forward-repair plan.

M2.1 regression stays pinned through 0002. Latest reports are under
`.cache/m2-identity` / `.cache/m2-authorization`; later runs do not overwrite accepted
evidence. Reviewed snapshots and actual exits are saved under `evidence/m2/m2-2`.
Final commands: `pnpm.cmd validate`, `test:authorization:db`, `test:identity:db`,
`audit:dependencies`, blueprint validation and `git diff --check`.

Initial policy tests deliberately caught two positive failures in an always-deny
stub. The first DB fixture run failed on a raw-driver date parser assumption;
date normalization and textual ledger snapshots corrected the harness. Final
results must come from saved command exits, not these intermediate attempts.

No Android/browser authentication test applies to this backend slice. Fastify
injection is not browser/physical-device/SMS/Keycloak acceptance. No package
versions or dependencies changed. The inherited low dependency advisory remains
disclosed, with no suppression.

## Remaining gates and next

Final execution window: 14:12:37-14:15:02 UTC, 2026-11-05. No failed or skipped
tests remain in this final run:

| Command | Actual result |
| --- | --- |
| `pnpm.cmd validate` | PASS: 56 tests (2 contract, 45 API including 36 policy cases, 9 foundation/compatibility/native), lint, strict workspace TS, contract reproducibility and API/admin builds |
| `pnpm.cmd test:authorization:db` | PASS: 12 real isolated PostgreSQL/Fastify tests |
| `pnpm.cmd test:identity:db` | PASS: 11 M2.1 regression tests, pinned to migration 0002 |
| `pnpm.cmd audit:dependencies` | PASS at unchanged moderate threshold; one inherited low finding |
| Blueprint / `git diff --check` | PASS |

PostgreSQL 17.5/PostGIS 3.5.2, UTC. Evidence:
[commands and executed-source hashes](../evidence/m2/m2-2/commands.json),
[full validation](../evidence/m2/m2-2/validation.txt),
[authorization DB tests](../evidence/m2/m2-2/authorization-database-tests.txt),
[DB checkpoints](../evidence/m2/m2-2/database-results.json),
[M2.1 regression](../evidence/m2/m2-2/identity-regression-tests.txt).
CI configuration is updated but not run remotely: this slice has not been pushed.

Gates A-E remain closed. Keycloak current-factor assurance and propagation bounds
need M2.5 proof (M2-A02). Auditor metadata permission, fare activation and GPS grants
remain separately reviewed. No public registration, delegation, recovery, emergency
access, live SMS, real documents or operational capability is enabled.

Recommended next slice after owner review: M2.3 passenger OTP with real random/
hash/Redis proof and a non-network MockSmsGateway. That work has not begun. Push
or PR publication needs separate explicit authorization.

Implementation references: [PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html),
[secure function definitions](https://www.postgresql.org/docs/17/sql-createfunction.html),
[Nest interceptors](https://docs.nestjs.com/interceptors).
