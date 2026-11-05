# M2.0 / M2.1 local identity foundation acceptance

Date: 2026-11-05. **M2.0 COMPLETE; M2.1 COMPLETE - LOCAL/DISPOSABLE ENGINEERING ACCEPTANCE.**
Full validation run: 12:38:52-12:40:56 UTC. A subsequent canonical-LF database
recheck and matching executed/staged migration hashes are recorded in
`evidence/m2/m2-1/commands.json`.
This is a local/disposable storage slice, not completed M2 authentication.

## Baseline and preservation

Fetched `origin/main`, verified M1 merge
`553c5d7011f6768f8323e898b23a381775ad9810` and identical M1 source tree to the
previous feature head. Original checkout `TRISSEA_Platform` remains on
`docs/m2-implementation-plan` with all existing user edits/evidence preserved.
Implementation is in sibling worktree `TRISSEA_Platform_m2_identity`, branch
`feat/m2-identity-foundation`, created from the fetched merge. No reset/stash,
remote/identity change, main push, merge or deployment.

The copied M2 planning documents are reconciled with the owner directive. D11 and
Keycloak architecture are accepted for local development. The prior Supabase
recommendation is explicitly superseded with historical references preserved.
No Supabase package or service is introduced. Doc 50 is a preserved policy copy,
not an implementation change.

## Implementation and database review

`0002_identity_foundation` adds a private `identity` schema with 19 Drizzle tables:

- `app_users`, `user_personas`, `auth_identities`;
- `city_tenants`, `toda_organizations`, `city_memberships`;
- `roles`, `permissions`, `role_scopes`, `role_permissions`, `scoped_role_assignments`;
- `app_sessions`, `refresh_credentials`, `otp_challenge_metadata`, `otp_redemptions`;
- `account_consents`, `administrative_identity_mappings`, `audit_events`, `outbox_events`.

UUIDs, lifecycle/check constraints, composite city/TODA FKs, identity/user/purpose
session binding, null-safe assignment uniqueness, version fields and indexes are
explicit. All time fields use `timestamptz`; connections use UTC. No driver,
vehicle, permit, operational or evidence-document table is introduced in M2.1.

Catalogs seed twelve existing roles, eleven existing permissions and allowed
scope kinds only. No accounts, TODAs, user assignments, admin mappings or
role-permission edges are seeded. Synthetic fixtures exist only in disposable
tests. New grant permission names and policy enforcement wait for M2.2 review.
The initial city remains Tuguegarao; a test fixture does not activate that city or
its organizations for real operations.

`IdentityCrypto` uses standard Node AES-256-GCM with random 96-bit IV, authenticated
purpose/key-version binding and separate 256-bit HMAC-SHA256 lookup key. Only
encrypted identity subjects and keyed digests are persisted/indexed. No passwords,
OTP values/hashes, real contact records or signing keys are seeded/persisted by
this slice. OTP DB records contain metadata and one unique accepted redemption;
Redis proof/attempt/consume is M2.3. Only one lookup-key version is active here;
rotation/backfill/duplicate fencing requires a later reviewed procedure.

`ScopedIdentityStore` uses Drizzle queries with explicit scope filters and
transaction-local server-derived RLS context. `IdentityStore` implements current
mobile-session storage checks, optimistic account restriction and own-session
revocation. These are internal storage methods, not authenticated HTTP handlers
or the M2.2 authorization engine. No client header/body can invoke them directly.

The database locks the parent account during session insertion. Restriction and
session revocation invalidate refresh credentials and append identifier-only
audit/outbox records atomically. Revoked/expired sessions and consumed/revoked
refresh state cannot be reactivated; account recovery shortcuts are blocked.
Audit, consent and redemption history is append-only. Outbox payload identity is
immutable; no credential/SMS/document JSON payload is stored.

Automatic storage-trigger events currently identify system actions with no human
actor. Before any future HTTP mutation is exposed, its slice must bind the verified
actor/session/trace and reason within the transaction; this slice claims no
authenticated privileged HTTP audit attribution.

Two NOLOGIN/non-owner/NOBYPASSRLS groups separate scoped runtime reads from auth
storage writes. Real synthetic LOGIN users test those grants. Runtime cannot
read encrypted subjects, raw auth-session internals, admin mappings, or mutate
grants/accounts. Auth storage cannot assign roles or provision admin mappings.
RLS is enabled and forced on eight read-facing tables; write privileges are
further restricted. Migration-only triggers, FORCE clauses and SQL role privileges
are maintained in reviewed SQL, not inferred from Drizzle alone.

RLS context is a trusted-server boundary, not independent authentication:
SQL injection or a compromised application DB credential can change custom
settings. M2.2 must resolve permissions/ownership/scope from current DB records,
never caller-supplied headers or tokens. Production role provisioning/hardening,
key storage/rotation and backup policy remain review gates.

## Local setup and actual commands

Prerequisites verified: Node 22.17.0, pnpm 11.20.0, Docker Desktop and cached
PostGIS image. ORM remains Drizzle 0.45.2; the API explicitly declares the already
reviewed `postgres@3.4.9`. The lockfile adds only its importer edge; no versions or
package integrity entries are upgraded.

From the implementation worktree:

```powershell
pnpm.cmd install --frozen-lockfile
powershell -NoProfile -File scripts/start-identity-test.ps1
pnpm.cmd test:identity:db
pnpm.cmd validate
pnpm.cmd audit:dependencies
python scripts/validate_blueprint.py
git diff --check
```

Initial offline install failed because one pinned masked-view tarball was missing
from the cache; the frozen online install fetched it successfully. Initial Windows
PowerShell preparation used unavailable newer .NET APIs; it now delegates credential
generation to Node and was retested. An intermediate TypeScript transaction-adapter
type error was corrected by using Drizzle's own transaction API. One local output
wrapper failed to display a Unicode build checkmark after `validate` itself exited
zero; the final UTF-8 evidence runner records actual command exits directly.
No test failure is hidden or converted to a pass.

`start-identity-test.ps1` preserves an existing ignored `.env.m2-test`, otherwise
generates a random test password. It starts only `infra/compose.m2-test.yml`,
project `trissea-m2-identity-test`, loopback **15433**, database control namespace
`m2_control`, PostgreSQL data on tmpfs and **no Docker volume**. Image is the
existing reviewed `postgis/postgis:17-3.5` digest
`sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6`.
The M1 services/ports **15432/16379**, volumes and databases are not touched.

Each test run creates a new `trissea_m2_test_<12 hex>` database and manifest, never
clears an existing database. The test DB is retained for review in the ephemeral
cluster. Tooling requires development + loopback + exact random-name pattern +
explicit disposable opt-in + matching manifest. Shared migration runner is an
internal utility; CLI/harness validates targets before executing it. The test owner
has DDL/role privileges only in this isolated cluster; APIs never use that identity.

Existing M1 `db:up` defaults to `0001_foundation`, preserving its workflow and
ledger/checksum behavior. Identity DDL is explicit disposable-only opt-in. No
Drizzle push or legacy `001_core.sql`/reference seed execution. Migration IDs and
up/down checksums remain validated transactionally under the existing advisory lock.

Rollback of `0002` is tested only on the dedicated disposable DB. It drops only
named identity objects, uses no CASCADE, and aborts/rolls back if an unrelated object
depends on them. M1 ledger/table, PostGIS, manifest and unrelated sentinel survive.
NOLOGIN groups remain rather than dropping cluster roles another DB could use.
Real retained-data deployments require approved forward repair, not this test down.

## Evidence and acceptance boundary

| Executed command | Actual final result |
| --- | --- |
| `pnpm.cmd validate` | PASS: contract reproducibility, lint, all workspace strict TS, 20 tests (2 contract + 9 API + 9 foundation/compatibility/native), API/admin builds |
| `pnpm.cmd test:identity:db` | PASS: 11 isolated database tests; zero failed/skipped; PostgreSQL 17.5/PostGIS 3.5.2, UTC |
| `pnpm.cmd audit:dependencies` | PASS under unchanged moderate threshold; one existing low advisory, zero moderate/high/critical |
| `python scripts/validate_blueprint.py` | PASS |
| `git diff --check` | PASS |

The low `deepmerge` advisory is inherited from M1 (GHSA-gcqx-w48m-w2h4); it is not
suppressed or claimed fixed. No failed test remains in the final run. Expected
negative transaction/constraint/permission outcomes are asserted as test cases.

- [Executed commands and source hashes](../evidence/m2/m2-1/commands.json).
- [Full validation](../evidence/m2/m2-1/validation.txt).
- [Database TAP output](../evidence/m2/m2-1/database-tests.txt).
- [Database checkpoints/versions](../evidence/m2/m2-1/database-results.json).
- [Dependency audit](../evidence/m2/m2-1/dependency-audit.txt).

Database tests include positive/negative cases, two actual connections for identity
and redemption races, non-owner RLS logins, twelve alternating pooled contexts,
rollback context cleanup, stale-version/ownership denials, revocation vs session
creation, immutable history, admin storage MFA/mapping constraints, fresh/repeat/
failure/down/reapply and M1/unrelated preservation. Check expressions are independently
normalized by PostgreSQL and compared with Drizzle; columns/types/defaults/nullability,
PK/unique/FK/indexes and RLS flags also match. Admin fixtures prove storage invariants,
not actual Keycloak OIDC/MFA authentication. Runtime API remains default-deny.

No Android/browser test is applicable to this backend-only storage slice; mobile
and admin source is unchanged. No new endpoint: MVP/broad OpenAPI and generated
clients remain unchanged and contract checks pass. Keycloak image/container/realm,
OTP/SMS gateways, JWT issuance, functional refresh, login routes and verification
workflows are later slices. No live provider, recovery, real document or operating
capability is enabled. This is not M2 COMPLETE or production readiness.

GitHub workflow adds isolated DB tests and preserves M1's migration boundary;
it has not run remotely because this slice is not published. Stop after M2.1 for
owner review before M2.2. Publication needs separate authorization under doc 50.

M2.2 follow-up: the owner approved continuing. Subsequent M2.1 regression runs
stay pinned through `0002_identity_foundation` and write their latest report to
`.cache/m2-identity/database-results.json`; this accepted evidence snapshot is
preserved. CI uploads that fresh cache report. See doc 58 for M2.2 acceptance.
