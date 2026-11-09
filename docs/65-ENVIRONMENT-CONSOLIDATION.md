# Task 5A — Environment consolidation and cleanup review

Status: **APPROVED CLEANUP COMPLETE — Git template tracking pending**.
Task 5A's final Git acceptance remains in progress: the new development template
is intentionally unstaged, and the retired template's deletion is unstaged.
Owner convention approved 2026-11-09. This supersedes earlier dotenv setup
instructions without rewriting historical M1/M2 execution evidence.

## Target and approval boundary

The active primary checkout is `C:\Users\apera\Projects\TRISSEA_Platform`, branch
`test/m2-security-acceptance`. Exactly four root dotenv files are the target:

| File | Purpose | Intended Git disposition |
| --- | --- | --- |
| `.env.local` | Canonical local development and isolated fixture settings | Ignore |
| `.env.local.example` | Development schema/template, blank secret placeholders | Track after review; currently unstaged |
| `.env.production` | Unprovisioned optional preparation; release gate false | Ignore |
| `.env.production.example` | Production configuration contract, no credentials | Track |

The owner explicitly approved the six-file cleanup after reviewing the manifest.
Those six primary-root files were removed individually after current hashes,
canonical mappings and encrypted backup restoration were reverified. Exactly the
four approved files now remain at the primary root. No staging, commit, push, PR,
merge or production activation was authorized or performed.

## Inventory and preservation

The [initial inventory](../evidence/task5a/environment-inventory.json) covers 22
project-owned files: 16 in the primary checkout (including eight older cache
archives) and six in the sibling worktree. No application-specific dotenv files
were found outside dependencies. Task 5A additionally created the two approved
new root files and two immutable template baseline snapshots; the latter are
explicitly retained in the manifest. Dependency-owned configuration is excluded.

File contents were not printed. All 22 original files were encrypted using
Windows DPAPI **CurrentUser** and round-trip verified outside the repository,
under `%LOCALAPPDATA%\TRISSEA\secure-backups\task5a-<timestamp>`. The exact private
location and restoration map are in ignored `.cache/task5a/secure-backup.json`.
Restoration requires the same Windows user's DPAPI context. Neither encrypted
archives nor plaintext secret copies are included in tracked evidence.

The [mapping record](../evidence/task5a/configuration-mapping.json) records 34
verified settings/credential/reference mappings without values. Existing canonical
values were preserved. Legacy provider settings remain inactive; canonical local
SMS is mock-only and live delivery is prohibited. Earlier independent database
logins, key files, JWT audiences, Redis namespaces and ports were not merged or
reused across roles. The six approved root files are now retired. All excluded
archives and the sibling's dotenv/bind-mounted generated files remain untouched.

## Configuration boundary

`scripts/environment.cjs` is the shared runtime boundary. Local reads use only
root `.env.local`, regardless of a package's working directory. Trusted process
injection overrides canonical values. There is no `.env`, per-app or `.env.m2-*`
fallback. Named profiles project settings into the existing runtime interfaces:

| Profile | Canonical namespace | Existing service interface / isolation |
| --- | --- | --- |
| `foundation` | `M1_*` | M1 database/Redis, ports 15432/16380; identity and disposable flags off |
| `test` | `M2_TEST_*` | Dedicated `/m2_control` on 15433; explicit disposable opt-in and manifest checks |
| `passenger` | `PASSENGER_LOCAL_*` | Passenger fixture role/key/port 4100 projected into the mobile runtime |
| `driver` | `DRIVER_LOCAL_*` | Separate driver fixture role/key/port 4101; authentication never grants driving eligibility |
| `admin` | `ADMIN_*`, `KEYCLOAK_*` | Separate app runtime role on 15433, API 4102; isolated IdP database/credentials and mandatory TOTP |

These standalone databases are slice test environments. The combined M2 harness
still creates **one** disposable application database with separately privileged
runtime roles. No per-module deployment architecture or account/tenant model was
introduced. No schema migration or migration checksum changed.

Preparation helpers fill missing settings only; they refuse to replace configured
values. Run them sequentially. An existing, missing or populated database is not
silently replaced. The former admin `--new-disposable` configuration-replacement
shortcut now rejects before mutation; replacement needs a separately reviewed
procedure. Test-only per-run database passwords, keys and URLs remain in process
memory/injection rather than new permanent dotenv files.

Schema/defaults and comments live in `scripts/environment-schema.cjs`. Update the
schema and applicable examples in the same coding change:

```powershell
node scripts/generate-environment-examples.mjs
node scripts/generate-environment-examples.mjs --check
pnpm.cmd environment:check
```

Secret placeholders are empty. Initial OTP/session policy remains bounded by
the existing domain validators and the configuration boundary. Local live SMS,
recovery, real documents, operational services and production activation fail
closed. Mock messages remain accessible only to the isolated test harness.

## Current development commands

For a new installation, copy `.env.local.example` to `.env.local` **only if the
target does not exist**. The preparation helpers also support a missing canonical
file, without replacing existing credentials:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev:infra:prepare
```

Use the canonical infrastructure workflow (Windows `pnpm.cmd`, Linux `pnpm`):

```powershell
pnpm.cmd dev:infra:prepare
pnpm.cmd dev:infra:up
pnpm.cmd keycloak:provision
pnpm.cmd dev:infra:check
```

The only Compose file is `infra/compose.dev.yml`, project `trissea-dev`.
`dev:infra:down` stops only this project and preserves all data volumes.
Core application and Keycloak databases have separate credentials; disposable
fixtures remain in the separate test cluster. All mounts are primary-relative.
Redis is canonical on 16380, including the foundation profile. Compose variables
are explicitly mapped; `--env-file` alone does not transfer them to services.
Provisioning is reproducible and does not grant TRISSEA roles or replace a realm.

```powershell
pnpm.cmd passenger:prepare
pnpm.cmd driver:prepare
pnpm.cmd admin:prepare
pnpm.cmd dev:api
# Separate terminals for isolated persona/admin fixtures as needed:
pnpm.cmd dev:passenger:api
pnpm.cmd dev:driver:api
pnpm.cmd dev:admin:api
pnpm.cmd dev:admin:identity
pnpm.cmd dev:passenger
pnpm.cmd dev:driver
```

Expo receives only the two documented public identity values from canonical
configuration and uses `EXPO_NO_DOTENV=1`. Both apps retain distinct Metro ports
8081/8082. Vite uses `envDir: false` and an explicit server-side proxy. No backend
credentials are mapped into a client bundle. The dispatch worker is currently a
README implementation slot, with no executable or separate dotenv file to migrate.

Production startup reads process injection by default. The API's explicit
`--production-file` mode accepts only root `.env.production` when `NODE_ENV` is
already production. It never loads local configuration. Actual production API
activation remains unconditionally denied during M2, including when otherwise
valid configuration is supplied. No production credentials were created.

## Exact cleanup manifest — approved and executed

The complete [revision 1 manifest](../evidence/task5a/cleanup-manifest.json) lists
every original file and the two new baseline archives, with explicit dispositions.
The owner approved only these **six primary-root files**, and each is now removed:

| Original path (under the primary root above) | Replacement | Data preserved? | References migrated? | Safe to remove? |
| --- | --- | --- | --- | --- |
| `.env` | `.env.local` namespaces; inactive candidate credentials retained | Exact encrypted backup + verified mappings | Yes; current code/CI | Removed under owner approval |
| `.env.example` | `.env.local.example` | Exact encrypted original; new complete schema/template | Yes; historical evidence labeled | Removed under owner approval |
| `.env.m1.local` | `.env.local` `M1_*` | Existing M1 connections/settings + exact encrypted backup | Yes | Removed under owner approval |
| `.env.m2-test` | `.env.local` `M2_TEST_*` | Exact credentials/control URL preserved | Yes | Removed under owner approval |
| `.env.m2-passenger` | `.env.local` `PASSENGER_LOCAL_*` | Exact role/key/issuer/namespace settings preserved | Yes | Removed under owner approval |
| `.env.m2-driver` | `.env.local` `DRIVER_LOCAL_*` | Exact independent role/key/issuer/namespace settings preserved | Yes | Removed under owner approval |

Sibling files and all historical/cache snapshots are **excluded from deletion**.
Keep the sibling and its generated files. At the Task 5A execution time, running
Keycloak/Postgres still referenced those bind mounts; ADR 66 subsequently removed
the runtime dependency while preserving every sibling file. No database, Docker resource, signing key or credential is a
cleanup target. Exact hashes and in-memory DPAPI restoration were reverified
before deletion. The initial combined command was rejected by automatic safety
review with `blocked by policy` and did not execute. Each narrower, individual
literal-path PowerShell deletion subsequently passed review and exited 0. No
recursive deletion or additional path removal occurred. The [execution record](../evidence/task5a/cleanup-execution.json)
records the approval and remaining four files. Git still records `.env.example`
as an unstaged deletion; `.env.local.example` remains untracked until separately
authorized Git review/staging. Neither actual secret-bearing file was staged.

## Validation and proposed M2 submission scope

### Revalidation after approved cleanup

The [post-cleanup record](../evidence/task5a/post-cleanup-validation.json) confirms
145 full validation tests, 11 disposable migration tests, eight HTTP tests, five
Playwright tests, four API startups, both Metro servers and three production
startup-denial cases passed with the legacy root files absent. M1 PostGIS/Redis
verification and all three Compose configuration checks also passed. The earlier
remaining 69 database/authentication cases, Doctor/exports and audit results below
were not rerun or relabeled as post-cleanup execution.

The [preservation check](../evidence/task5a/post-cleanup-preservation.json) confirms
all four canonical files are byte-identical to their pre-deletion versions,
14 retained original sibling/archive dotenv files are unchanged, and six Docker
containers/mounts are preserved. No additional cleanup paths, signing keys,
credentials, database volumes or existing databases were removed or reset.

Only Git integration remains for Task 5A's final tracked-template criterion:
`.env.local.example` is unignored but untracked, and `.env.example` is an unstaged
tracked deletion. These must be reviewed and staged under separate authorization;
the cleanup approval was not expanded into Git delivery permission.

### Preparation validation before cleanup

The [actual validation record](../evidence/task5a/validation-results.json) and
supporting reports are under `evidence/task5a/`. All final checks below passed on
2026-11-09. Raw command logs remain ignored in `.cache/task5a/`.

| Check / executed command | Observed result |
| --- | --- |
| `pnpm.cmd validate` | Exit 0; 145 tests (including seven new configuration tests), strict TypeScript, lint, contracts, API/admin builds |
| `pnpm.cmd test:identity:db` / `test:authorization:db` | 11 / 12 passed on fresh disposable fixtures |
| `pnpm.cmd test:passenger:auth` / `test:driver:auth` | 15 / 15 passed; actual mock OTP, sessions, consent and eligibility denial |
| `pnpm.cmd test:admin:auth` | 15 passed; actual local Keycloak password/TOTP and negative/revocation/outage cases |
| `pnpm.cmd test:verification` | 12 passed; synthetic-only scoped/concurrent decisions |
| `pnpm.cmd test:m2:integration` / `test:m2:browser` | 8 HTTP / 5 Playwright tests passed; current canonical settings used |
| `pnpm.cmd mobile:check` / `mobile:doctor` / `mobile:export` | Both apps passed; Doctor 21/21 each; both exported |
| `pnpm.cmd audit:dependencies` | Exit 0; no known vulnerabilities reported |
| `pnpm.cmd environment:check` and three Compose `config --quiet` commands | Exit 0; schema, namespace and Compose mappings valid |
| `pnpm.cmd db:verify` | Existing M1 PostGIS/UTC/Redis verified read-only; Redis `PONG` |
| Existing foundation/test/Keycloak/passenger/driver/admin prepare commands | Exit 0; configured credentials/files preserved, no replacement database generated |
| Four `node services/api/dist/main.js` process-injected profiles | Health 200, bookings false; enabled identity routes reject with 401; intentionally absent foundation identity routes return 404 |
| `node scripts/start-mobile-identity.mjs passenger` / `driver` | Actual Metro status 200/running on 8081 / 8082; owned test processes stopped |
| Production process injection, explicit production file, production-file flag without production mode | All three startup attempts denied with exit 1 as expected; no production server activated |
| Git/preservation checks | Twenty original legacy/sibling/archive files byte-identical; six container IDs/mounts retained; zero dotenv deletions; empty index |

See the [startup report](../evidence/task5a/api-startup-results.json),
[Metro report](../evidence/task5a/metro-results.json),
[preservation/Git report](../evidence/task5a/preservation-and-git-results.json),
[identity migration report](../evidence/task5a/identity-database-results.json) and
[browser report](../evidence/task5a/browser-results.json). The isolated migration
suite proves fresh/repeated application, constraints, rollback/reapply, sentinel
preservation, transaction failure and concurrency. No operational migration,
volume deletion or existing database reset was performed.

During preparation, TypeScript rejected an explicitly undefined optional
production-file argument; conditional options fixed it. A separate startup
harness initially expected 401 for the deliberately absent foundation identity
module. Source inspection confirmed its documented 404; the corrected check also
verifies all identity flags are off. Enabled M2 profiles still require 401 and the
positive OTP/TOTP suites pass. No API policy or authentication assertion was
weakened. Initial failed logs are retained locally with the successful final runs.

Existing historical evidence is not relabeled as a new run. Android emulator,
physical-device, iOS and manual accessibility checks were not repeated for this
configuration task. The existing M1 development connection still has its original
database-owner privileges; M2 persona/admin runtime logins are non-superuser and
cannot bypass RLS. M1 production privilege hardening remains outside this task.
GitHub CI definitions/parity were reviewed locally; remote Actions were not run
because publication is not authorized. External gates A–E remain closed.

The proposed M2 commit/PR scope now includes this environment boundary, namespaces,
canonical examples, setup/Compose/Expo/Vite/CI migrations, policy updates,
configuration regression tests and Task 5A evidence/manifest alongside reviewed
M2.0–M2.7 work. The six approved physical retirements are now included in that
reviewed scope; only the old template was previously tracked. Exclude every actual dotenv file,
credential/key, DPAPI backup, local cache, APK and unrelated preexisting user change.
No commit/PR has been created and no M3 implementation is included.
