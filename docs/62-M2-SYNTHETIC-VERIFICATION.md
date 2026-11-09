# M2.6 — Synthetic driver and vehicle verification

> Current local Docker workflow: [ADR 66](66-ADR-DEVELOPMENT-INFRASTRUCTURE.md), one persistent `trissea-dev` project. Earlier container/Compose commands below are historical execution evidence, not startup instructions.

> Environment setup update (Task 5A): use [the canonical configuration guide](65-ENVIRONMENT-CONSOLIDATION.md). Legacy dotenv names/commands below are historical acceptance evidence, not current setup instructions. Existing files remain pending explicit cleanup approval.

Status: **COMPLETE — LOCAL/SYNTHETIC ENGINEERING ACCEPTANCE**, 2026-11-06.
Owner approved continuation after M2.5 `d148bde`. Overall M2 remains IN PROGRESS;
stop for owner review before M2.7. No production readiness or legal approval.
Branch: `feat/m2-driver-verification`, stacked on the accepted local slices.
The original planning checkout and its uncommitted work remain untouched.

## Design and acceptance plan

Implement three case kinds: DRIVER, VEHICLE and TODA_MEMBERSHIP. All cases bind
an existing driver-owned vehicle relationship, city and TODA through composite
foreign keys. Reuse central authorization and its transaction/lock/audit boundary.
Verification Officers use existing `driver.verify`; TODA Managers use existing
`toda.members.manage` for membership cases only. Every reviewer must be explicitly
assigned, have a current same-grant city/TODA scope and fresh Keycloak MFA, and
must not be the applicant. No new role/permission or role-delegation endpoint.

Add incremental migration 0007 with seven tables: synthetic evidence heads and
immutable versions, cases, immutable submissions, assignments, decisions and
encrypted idempotency receipts. Preserve 0001–0006 and their ledger. Test fresh,
repeated/concurrent apply, failed commit, rollback/reapply and sentinel preservation
only on a newly created, manifest-checked disposable local database.

Evidence and assignment provisioning remain isolated owner-controlled fixtures.
There is no approved permission for arbitrary reviewer assignment or real document
intake. No public assignment, file upload, URL, document-number, permit or evidence
content endpoint is introduced. Versioned synthetic metadata is bound to one
applicant/relationship/kind and may be selected only by its owner or assigned
reviewer. Capacity/validity come from that explicit fixture, never a guessed default
or a reviewer-supplied claim. Real assignment/provisioning policies remain pending.

State machine: DRAFT -> SUBMITTED -> APPROVED or REJECTED; APPROVED -> REVOKED or
EXPIRED. REJECTED/REVOKED/EXPIRED can submit a new evidence revision. Old rounds,
assignments and decisions remain immutable. Decisions require expected case and
evidence versions and current target/policy versions. Concurrent decisions must
have one winner, with audit/outbox and projected synthetic driver facts atomic.
Expiry is enforced by DB-time reads immediately; an authorized expiry decision
records its history after the deadline. No automatic expiry-worker claim.

Only APPROVE requires submitted target/policy/head revisions to remain current.
REJECT can return stale submissions for revision; otherwise a stale submitted case
would be stuck. Suspended applicants/targets and closed scopes still deny review.
An approved case retains its immutable stored state when its evidence head changes,
but reads report `effectiveState=STALE` and `evidenceCurrent=false`. When the
verification core is enabled, the driver domain additionally requires all three
current cases on the asserted relationship, with decision references matching the
projected facts. Replacing evidence cannot preserve synthetic identity eligibility.

Only a hardened non-login projection function owner can update approved driver
facts. API database credentials cannot directly approve profiles, vehicles or
affiliations. Revocation/expiry affects only facts still carrying that decision's
reference. It cannot overwrite a later approval. No membership/role grant or permit
assertion is manufactured. Login, case approval and operational eligibility remain
separate; all online/dispatch/GPS and real-driver approval flags stay false.

Use a separate least-privilege connection role in the SAME application database,
not a per-module database. `M2_VERIFICATION_ENABLED` defaults false and requires
the existing mobile/driver/admin cores in disposable local synthetic mode. Reject
production, mismatched DBs and unsafe roles. Preserve existing env files and M1
15432/16379 infrastructure. Update safe example templates and OpenAPI v0.9.0.

Acceptance: positive owner submission and scoped review; self/foreign/unassigned,
cross-city/TODA and stale grant/session/MFA denials; stale evidence/target/policy;
idempotency conflict and concurrent decisions; rejection/resubmission/history;
expiry/revocation and rollback; SQL role/RLS/pool isolation; audit failure rollback;
contract/input/redaction checks; applicable full validation and dependency audit.
Use actual local Keycloak/browser proof where integrated. No Android or physical
device acceptance is claimed by this backend slice; M2.7 remains separately gated.

Gates A–E remain closed. Stop for owner review before M2.7; no push, PR, merge,
public deployment, live SMS, real documents or real operating approval authorized.

## Execution evidence

All mandatory local M2.6 checks passed. The final `test:verification` run executed
12 tests in 90.300 seconds: 12 passed, 0 failed/cancelled/skipped. It includes
an assigned reviewer with the wrong TODA grant (403), missing actor context (NULL),
denied function-owner role assumption and plaintext-credential leakage assertions.

| Command actually executed | Result |
| --- | --- |
| `pnpm.cmd validate` | Exit 0: contracts, lint, all workspace TypeScript checks, 115 tests (92 API + 9 client + 14 repository), NestJS and Vite builds |
| `pnpm.cmd test:identity:db` | Exit 0: 11 passed |
| `pnpm.cmd test:authorization:db` | Exit 0: 12 passed |
| `pnpm.cmd test:passenger:auth` | Exit 0: 15 passed; mock SMS |
| `pnpm.cmd test:driver:auth` | Exit 0: 15 passed; synthetic intake |
| `pnpm.cmd test:admin:auth` | Exit 0: 15 passed with real Keycloak, Chromium, NestJS and Vite; 188.627 seconds |
| `pnpm.cmd test:verification` | Exit 0: 12 passed in one combined application database |
| `pnpm.cmd exec eslint scripts/test-verification.mjs` | Exit 0 after the final negative-case assertions |
| `pnpm.cmd audit:dependencies` | Exit 0 at moderate threshold: 0 moderate/high/critical, 1 existing low |
| `pnpm.cmd audit --audit-level=low --json` | Exit 1 as expected for the low `deepmerge` finding GHSA-gcqx-w48m-w2h4; no dependency changes |
| `pnpm.cmd contracts:generate` | Exit 0; checked again by validate |
| `git diff --check` | Exit 0; reviewed task scope, secrets and ignored artifacts |

The final sequential batch used Node child processes to run the installed pnpm
CLI and preserve exit codes. All six integration commands total **80 passing
tests**; this is separate from the 115 repository validation tests. Earlier failed
development runs are not counted as passes. One intermediate rollback was correctly
refused after the unaccepted 0007 file changed during a run; a fresh disposable
database was used for final acceptance, without altering a ledger or checksum.

PostgreSQL **17.5**, PostGIS **3.5.2**, UTC and non-owner scoped transactions were
observed by the identity/authorization regressions. The combined runtime connected
to real Redis on **16380** (`PONG`) and PostgreSQL on **15433**; all three application
connection roles used the same new manifest-checked test database. Real local
Keycloak **26.8.2** discovery, signed OIDC, password/TOTP and current assurance
were exercised. M1 services on 15432/16379 and prior databases/volumes were preserved.
No operational migration was run against an existing non-disposable database.

Evidence under [evidence/m2/m2-6](../evidence/m2/m2-6/):

- [Command exits and test counts](../evidence/m2/m2-6/validation.json)
- [M2.6 case/migration/security evidence](../evidence/m2/m2-6/verification-results.json)
- [Admin browser regression](../evidence/m2/m2-6/admin-results.json), plus identity,
  authorization, passenger and driver regression JSON files in the same folder
- [Dependency audit](../evidence/m2/m2-6/security-summary.json)
- [Actual reviewer sign-in](../evidence/m2/m2-6/reviewer-sign-in.png) and
  [masked TOTP step](../evidence/m2/m2-6/reviewer-totp.png)
- [Admin desktop](../evidence/m2/m2-6/admin-regression/admin-desktop.png),
  [mobile browser](../evidence/m2/m2-6/admin-regression/admin-mobile.png) and
  [error state](../evidence/m2/m2-6/admin-regression/admin-error.png)

Screenshots were inspected. They contain no OTP, password or authentication cookie;
the visible session UUID is an identifier, not a credential. The admin regression
verified loading/error/retry, keyboard focus, scoped access, Vite health proxy,
unapproved fares and disabled operations, without browser page exceptions.
It does not demonstrate a dedicated verification UI, Android or physical hardware.

No remaining local acceptance blocker was observed. The existing low dependency
finding, production hardening and all external approval gates remain review concerns.
No push, PR, merge, deployment, real SMS, real documents or real driver activation.

## Reproduction and configuration

Use the existing dedicated test infrastructure and local Keycloak configuration:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd test:verification
pnpm.cmd validate
```

`test:verification` reads ignored `.env.m2-test` and `.env.local` explicitly. It
creates a fresh manifest-checked random database on 15433, three independent
non-owner logins in that SAME database, fresh mobile signing/encryption keys and
Redis namespace on 16380. It starts the real Nest/Fastify AppModule in-process and
tests real HTTP routing using Fastify inject. Only runtime construction is
overridden for ephemeral keys; OTP/Redis, PostgreSQL policy, Keycloak assurance,
browser password/TOTP and domain services are real. No mock identity proof.
Disposable databases remain for inspection; no database, volume or Redis purge.

`M2_VERIFICATION_ENABLED` is a strict boolean defaulting false. True requires the
mobile, driver and admin core flags true. `M2_VERIFICATION_DATABASE_URL` must be
a local random test database on 15433, physically identical to
`M2_PASSENGER_DATABASE_URL` and `ADMIN_DATABASE_URL`, with separate login
credentials. Verification credentials inherit only verification and authorization
groups, never table ownership, mobile/admin storage or function-owner privileges.
Generated keys and actual URLs/passwords stay ignored. Existing local environment
files are preserved. No production or public fixture provisioning is provided.

Only the harness owner provisions synthetic evidence/assignments. This is a test
fixture boundary, not an HTTP bootstrap or an approved document-processing policy.
Callers cannot create evidence, select reviewers, grant membership/staff roles, set
capacity/expiry or manufacture permits. Idempotency receipts encrypt the original
response and bind actor, operation, key and request. Every retry passes current
authorization before receipt lookup.

Migration 0007 adds seven Drizzle tables. SQL-only deferred constraint triggers
additionally enforce cyclic current-history pointers; these are documented SQL
invariants. Immutable triggers retain version/submission/assignment/decision/receipt
history. Down is an isolated disposable-test operation only: it removes new
metadata while preserving prior driver facts and unrelated data. Reapplication
starts without cases and denies eligibility for old projections. A populated real
deployment needs a separately reviewed forward repair/retention strategy. Shared
cluster NOLOGIN roles are retained; no role/database/volume is dropped.

CI includes the new test command/artifact. GitHub execution remains unverified
until publication is authorized and CI is observed.

## Corrections found during implementation

- Restricted case INSERT initially failed because Drizzle included server-owned
  DEFAULT columns. An explicit parameterized column list preserves limited grants.
- INSERT RETURNING initially failed RLS because a STABLE visibility helper could
  not see the new row in that statement snapshot. Driver SELECT uses the row's own
  binding directly; administrator reads retain assigned scope checks.
- Review found SQL NULL handling in the metadata locator could return a resource
  without an actor context. `IS NOT TRUE` now denies unknown/missing context.
- Approved evidence revision could otherwise leave projected driver facts looking
  current. A driver-owned read port now requires matching current cases and head
  revisions; replacing evidence denies synthetic eligibility immediately.
- Generated mobile transport initially treated optional cursors as required headers.
  Generation now preserves optionality and encodes query parameters; the existing
  passenger transport and its tests remain in the regression suite.
- The combined harness omitted a CSRF token from its first session request rather
  than passing an undefined header. Negative session tests revoke a real session
  and require real password/TOTP reauthentication; they do not mutate immutable
  authentication timestamps or weaken database constraints.
- Windows memory pressure exposed cold browser/provisioning timeouts. Only offline
  fixture bootstrap (15s), Chromium setup (60s) and disposable CREATE DATABASE (60s)
  infrastructure deadlines were adjusted. API transaction/lock deadlines, OTP
  limits, session lifetimes and current-MFA assurance bounds were not widened.
- The initial PowerShell batch wrapper treated normal pnpm stderr as a terminating
  NativeCommandError, so that batch supplied no reliable exit record. The final
  validation runner captures native exit codes directly with Node child processes.
- Admin regressions now save new screenshots under ignored
  `.cache/m2-admin/screenshots/` to preserve the accepted M2.5 evidence. CI collects
  that location. M2.6 screenshots mask all input and attempted-username controls.

## Review limitations

This backend slice does not implement a document upload provider, reviewer
assignment/delegation UI/API or legal permit policy. Synthetic owner fixtures are
explicit and isolated; they are not a general privileged bootstrap procedure.
No booking, dispatch, fares, maps, GPS, shifts or public release is enabled.
Native/mobile authentication, secure-storage/session restoration, dedicated
verification screens, broader accessibility and physical-device checks remain
M2.7 or later approval work. Keycloak browser evidence proves authentication steps,
not a new administrative verification UI. No container security scan or production
capacity, backup/restore or deployment acceptance is claimed.
