# ADR 66 ? One canonical development infrastructure project

Status: **COMPLETE ? LOCAL/SYNTHETIC INFRASTRUCTURE ACCEPTANCE**, 2026-11-09.
This records engineering acceptance, not production readiness. Owner-authorized
M2 publication is subject to the final scoped Git/security review. Merge,
deployment, volume/backup/worktree deletion and M3 remain unauthorized.

## Decision and security boundaries

Use only `infra/compose.dev.yml`, project **`trissea-dev`**. Four services are
necessary under the owner's explicitly approved two-PostgreSQL fallback:

| Service | Loopback ports | Data / authority |
| --- | --- | --- |
| `postgres` | 15432 | Retained foundation application DB and separate `keycloak_identity`; distinct non-super application owner, IdP owner and IdP runtime logins |
| `postgres-test` | 15433 | Retained local/synthetic fixtures, `m2_control`, randomly named manifest-verified test databases; constrained non-owner application runtime roles |
| `redis` | 16380 | One persistent instance; separate development/run namespaces, atomic OTP state, coordination and original absolute TTLs |
| `keycloak` | 18080, health 19000 | Restored realm, subjects, credentials, TOTP, provider signing keys and client secrets; strict existing local issuer |

Migration/fixture tests require cluster-owner authority for PostGIS, global role
provisioning and FORCE-RLS fixture inspection. That authority remains in the
separate test server, never beside core application or IdP data. These are test
environments, not per-domain application databases or a microservice redesign.
The combined HTTP/browser harness creates one disposable application database
with distinct least-privilege runtime roles. Every cleanup remains name- and
manifest-verified. No existing migration file or checksum was changed.

Core application and IdP roles are NOSUPERUSER, NOBYPASSRLS, NOREPLICATION,
NOCREATEDB and NOCREATEROLE. Their passwords are unchanged. Application and IdP
DB public CONNECT privileges are revoked and explicit privileges are separate.
The test-owner role does not exist in core; core/IdP roles do not exist in test.
A newly generated, ignored, local infrastructure bootstrap credential is separate
from all previous logins. Keycloak never uses the TRISSEA application login.

Images reuse the installed reviewed versions, with full digests in Compose:
PostGIS `17-3.5`, Redis `7.4-alpine`, Keycloak `26.8.2`. No version upgrade was
introduced by this infrastructure task. PostgreSQL drops to its image's postgres
runtime; Redis and Keycloak explicitly use their supported non-root users.

Persistent volumes are `trissea-dev_pg_data`, `trissea-dev_pg_test_data` and
`trissea-dev_redis_data`. A fourth private configuration volume,
`trissea-dev_keycloak_import`, carries the immutable realm-import copy with
Keycloak-owned 0600 files; it is preserved like the data volumes. Redis uses
AOF/everysec/noeviction. Controlled stop/start
persistence was tested; power-loss durability and a Docker Desktop VM restart
were not tested. Redis everysec permits its documented crash-loss window.
Internal `core` and `test` networks remain separate. Separate project bridge
ingress networks supply Docker Desktop host access; all published ports bind
127.0.0.1. There is no shared core/test PostgreSQL network. Bind paths are
primary-relative; no sibling worktree is required at runtime.

Keycloak remains **local `start-dev` only**. Production HTTPS, proxy/hostname,
secret management, backups, key rotation and monitoring still require release
review. Password/TOTP, signed assurance, current factor/session checks, BFF
cookies, revocation, disabled registration/recovery and PostgreSQL authorization
are preserved. Realm roles never become TRISSEA grants.

## One developer workflow

Use Windows PowerShell `pnpm.cmd`; Linux/CI uses `pnpm`.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev:infra:prepare
pnpm.cmd dev:infra:up
pnpm.cmd test:infra:bootstrap
pnpm.cmd keycloak:provision
pnpm.cmd dev:infra:status
pnpm.cmd dev:infra:check
pnpm.cmd dev:infra:logs
pnpm.cmd dev:infra:down
```

Preparation fills missing values only and refuses replacement credentials or
artifacts. On a new setup it generates private secrets and relative artifacts in
ignored `.cache/dev-infra/` and existing key-cache locations. It refuses to invent
bootstrap credentials when retained canonical volumes exist. Recover the
approved configuration/keys instead. `up` does not prepare or rotate credentials.
Container initialization runs only for new PostgreSQL volumes; restart never
reinitializes a database. `down` is narrowly scoped **stop**, not volume deletion.
`logs` emits lifecycle metadata and suppresses SQL/authentication lines; it is a
sanitized operational summary rather than raw diagnostic output.

Exactly four root dotenv files remain: ignored `.env.local`, tracked
`.env.local.example`, ignored/unprovisioned `.env.production` and tracked
`.env.production.example`. The old template deletion and replacement are included
in the authorized submission. No permanent milestone-specific dotenv files are
created. Process injection supplies temporary test configuration. Update
`scripts/environment-schema.cjs` and generated examples in the same change.
Production injection/file validation never falls back to local configuration;
actual production API startup is unconditionally gated during M2.

Core/test credentials, ports and roles use explicit namespaces. `M1_*` retains
the foundation DB, `M2_TEST_*` controls fixture provisioning, `DEV_*` describes
canonical infrastructure, and `KEYCLOAK_*` remains separate. Foundation Redis
moves from 16379 to 16380. Compose explicitly maps service inputs; `--env-file`
is interpolation, not implicit environment transfer. Expo receives only the two
approved public identity values; Vite dotenv discovery is disabled. Backend
secrets are not client configuration.

`DEV_RESTORE_MODE` is documented migration-only process injection for restoring
into **new** volumes; ordinary `dev:infra:up` rejects it when true. Verified
staging endpoints (16432/16433/17380/18081/19001) were temporary process injection,
not persistent dotenv variants. Backend validators accept only normal/staging
local pairs and reject arbitrary endpoints/production. Final issuer remains
`http://127.0.0.1:18080/realms/trissea-local` to preserve existing identity mappings.

The compatibility aliases `infra:up`, `infra:down`, `keycloak:up` and the existing
PowerShell entrypoints delegate to this same workflow. The three old Compose
source files are retired. CI provisions the same canonical project and uses
independent disposable databases; ordinary teardown retains volumes.

## Original inventory and preservation

The [original inventory](../evidence/m2/dev-infra/original-inventory.json) records
full IDs, project/service labels, image digests, state/health, ports, mounts,
networks, owners and safe DB counts. Six verified TRISSEA containers belonged to
`trissea-m1-acceptance`, `trissea-m2-identity-test` and `trissea-m2-keycloak`.
No unrelated container was present or removed. Original networks are retained.
The IdP and fixture PostgreSQL stores used tmpfs; stopping them before export
would have lost their sole live copies. Therefore full staging acceptance
preceded controlled stop and final-port cutover.

Preservation used `pg_dumpall --roles-only -l postgres`, custom-format `pg_dump`
and `pg_restore --create --exit-on-error`, through private pipes. Source Keycloak
was paused, Redis writes quiesced, and PostgreSQL application connections checked.
Its two remaining JDBC connections were verified as belonging only to the paused
Keycloak container. Source table fingerprints were rechecked before cutover.

Windows DPAPI CurrentUser backups live outside Git under
`%LOCALAPPDATA%/TRISSEA/secure-backups/dev-infra-<timestamp>`. Exact locations and
restore manifests remain ignored. Restoration requires the same Windows account;
these are local preservation backups, not an approved portable disaster-recovery
system. Plaintext SQL, role password verifiers, Redis payloads and keys were never
written to tracked evidence or terminal output. The backup helper refuses to
overwrite an existing artifact. No encrypted backup was deleted.

The [preservation report](../evidence/m2/dev-infra/migration-preservation.json)
records **21 restored databases**, matching all user-table row counts/content
fingerprints before IdP startup and **50 unchanged role password verifiers**.
The three empty built-in `postgres` databases had no application tables/settings
to merge. Keycloak retained **38 users, 34 TOTP credentials and two realms**, plus
all original database contents, regardless of synthetic/disposable labels.
**203 Redis keys** transferred with unchanged absolute expiry and zero transfer
expirations. Existing databases were restored, never reset or operationally
migrated. Later suites created only independent disposable fixtures.

A second recovery check verified 29 encrypted migration artifacts and unchanged
source fingerprints for all 21 databases before old-container stop. Seven private
key/realm/production files are byte-identical to the initial snapshot. Original
local credentials were retained; only the new bootstrap identity, approved Redis
endpoint change and obsolete unused project setting changed canonical config.
[Worktree preservation](../evidence/m2/dev-infra/worktree-preservation.json)
confirms all 97 sibling dirty files, six sibling dotenv files and 198 excluded
primary user files are unchanged. Detached sibling configuration is historical,
not an active startup workflow; its files/worktree were not removed.

## Verified container retirement

The [exact manifest](../evidence/m2/dev-infra/retirement-manifest.json) was recorded
before controlled stop and updated only after final suites passed. These exact
legacy containers were removed with `docker rm <verified-id>` **without `-v`**:

| Container | ID prefix | Result |
| --- | --- | --- |
| `trissea-m2-keycloak-keycloak-1` | `fecdc94f8c65` | Removed; restored realm and primary-relative import |
| `trissea-m2-keycloak-postgres-1` | `a2d2fcece85f` | Removed; IdP DB/roles preserved in core volume and encrypted backups |
| `trissea-m2-identity-test-redis-1` | `a1ceb7f581e3` | Removed; unexpired state preserved |
| `trissea-m2-identity-test-postgres-1` | `c2b5dad126ba` | Removed; all retained fixture databases/roles restored |
| `trissea-m1-acceptance-redis-1` | `820b3dc1e844` | Removed; original named volume retained |
| `trissea-m1-acceptance-postgres-1` | `1a2c8f30bb15` | Removed; application DB/ledger restored; original named volume retained |

No legacy container remains. Both M1 named volumes and the old anonymous Redis
volume `07fdc703bd47b130367a310a3f1e76768f24c61862d531f4a42b513136e01342`
remain intact. Old networks, images and all backups remain; their deletion was
not authorized. No prune, global cleanup, volume deletion, worktree deletion,
production migration or unrelated container operation was used.

## Actual acceptance results

[Commands, phases, times and exit codes](../evidence/m2/dev-infra/validation-results.json)
distinguish staging and final-port execution. Raw logs remain ignored locally.
All commands below returned 0, except the three expected production denials (1).

| Check | Actual observed result |
| --- | --- |
| `pnpm.cmd install --frozen-lockfile` | Reviewed lockfile installed without regeneration |
| `pnpm.cmd validate` | 156 tests: 9 contract-client, 15 mobile-session, 95 API, 37 root; contracts/lint/strict TypeScript/API/admin builds passed |
| `test:identity:db` / `test:authorization:db` | 11 / 12 passed on staging and again on final ports |
| `test:passenger:auth` / `test:driver:auth` | 15 / 15 passed twice; secure mock OTP, consent, refresh/replay/races, restrictions and no operating eligibility |
| `test:admin:auth` | 15 passed twice with actual local Keycloak password/TOTP, current assurance, revocation, CSRF and outage cases |
| `test:verification` | 12 passed twice; synthetic assigned/scoped decisions, stale evidence, concurrency and operation denial |
| `test:m2:integration` / `test:m2:browser` | 8 HTTP / 5 actual Playwright tests passed twice; authorized and denied cases |
| `keycloak:provision` | Staging success, then two consecutive final-port executions passed without replacing the realm |
| `db:verify` / `dev:infra:check` | PostGIS/UTC metadata, Redis PONG, health, exact issuer, non-super roles and application/IdP/test isolation passed |
| `mobile:check` / `mobile:doctor` / `mobile:export` | Both apps passed; Doctor 21/21 each; both exports succeeded |
| `audit:dependencies` | No known vulnerabilities reported at execution time |
| `environment:check`, template parity and Compose config | Passed; four root files, no legacy active loader/startup references |
| Four API processes (`foundation`, `passenger`, `driver`, `admin`) | Health 200, non-super/no-RLS-bypass DB connections; absent foundation identity route 404, enabled identity routes 401 without proof |
| Passenger/driver Metro | Actual status 200/running on 8081/8082; owned check processes stopped |
| Production injection / explicit production file / wrong-mode file flag | All startup attempts denied (exit 1), no production server enabled |
| Restore-bypass startup / protected-backup overwrite | Both unsafe attempts rejected; ordinary up and DPAPI round-trip passed |
| Fare transcription structure | 42 area rows + one poblacion row; no legal/fare approval inferred |

The [cold restart](../evidence/m2/dev-infra/cold-restart.json) executed complete
canonical stop/start, comparing **753 retained table/role fingerprints across 21
DBs**, all three volume identities and **340 unexpired Redis values/absolute
expiries**. All were unchanged. No application users were deleted for this test.

Current masked browser evidence: [assigned case](../evidence/m2/dev-infra/assigned-driver-desktop.png),
[mobile membership](../evidence/m2/dev-infra/membership-mobile.png),
[denied role](../evidence/m2/dev-infra/restricted-role.png),
[revoked access](../evidence/m2/dev-infra/revoked-access.png),
[mobile denied scope](../evidence/m2/dev-infra/verification-mobile-access-denied.png).
[Final health/mounts](../evidence/m2/dev-infra/final-health.json),
[API startups](../evidence/m2/dev-infra/api-startup-results.json) and
[Metro](../evidence/m2/dev-infra/metro-results.json) provide separate evidence.

No native rebuild or Android UI rerun was required for Docker-only changes.
The genuine prior [30 emulator checkpoints](../evidence/m2/m2-7/android-results.json)
and screenshots remain dated November 8, not relabeled as new-stack execution.
Physical Android, iOS and manual screen-reader acceptance remain **NOT RUN**.

## Defects corrected and limitations

- Docker Desktop suppressed host publication on internal-only networks. Separate
  loopback ingress bridges fixed access while retaining internal network isolation.
- Restored former owner roles retained replication privilege; explicit
  NOREPLICATION hardening and live isolation checks corrected it.
- Windows bind aliases required canonical path normalization; sibling paths still
  fail containment checks. A drive-case-only unit expectation was corrected.
- Backup preparation initially used the wrong `pg_dumpall` database flag and a
  fingerprint `psql` command separator. Both failed safely before cutover, resumed
  source writers and retained failed attempts; corrected exports were verified.
- The restart harness initially rejected a legitimate numeric PostGIS table name;
  its identifier validator was corrected before any stop, then the complete
  comparison passed. No domain assertion or security policy was weakened.
- Child-process output now drains before command completion; backup creation is
  exclusive, and ordinary startup rejects restoration bypass. Raw private error
  details remain suppressed from public logs.

This is a development/test topology, not hardened production infrastructure.
The fixture superuser is deliberately isolated, local and disposable-only.
No new production credentials or actual staff/driver records were introduced.
Mock SMS remains local-only. Live SMS, real documents, real driver/TODA authority,
recovery/delegation and public deployment (Gates A?E) remain closed. No booking,
dispatch, GPS or M3 capability was enabled. Portable backup/restore, physical
hardware, production performance/capacity and operational approvals remain pending.

## Git submission

Use existing `test/m2-security-acceptance` history; preserve the six M2.1?M2.6
commits above merged M1 `553c5d7011f6768f8323e898b23a381775ad9810`. The explicit
submission includes M2.7, environment cleanup, canonical infrastructure, tests,
contracts/client integration, CI, relevant agent rules and sanitized evidence.
Private dotenv files, dumps, keys, APKs, caches, backup archives, generated Expo
type declarations and unrelated M1 evidence are excluded. The scoped known-value/
private-key/provider-token [secret review](../evidence/m2/dev-infra/secret-review.json)
found no candidates; this is not a comprehensive security certification.

Owner authorizes normal feature-branch commit/push and one **draft** PR to `main`.
Record the actual commit, PR and remote CI statuses in the delivery report; local
tests do not establish remote CI success. Do not merge, deploy or begin M3.


## Fresh Linux CI bootstrap follow-up

The initial draft PR runs passed both Linux/Windows static/application jobs but
failed both fresh infrastructure jobs at startup. The CLI suppressed private
Docker details as designed. Source review and an actual Linux UID reproduction
identified a bootstrap permission mismatch: 0600 host-runner-owned files cannot
be read by PostgreSQL/Keycloak runtime UIDs. Windows bind semantics had hidden it.

`start-core-postgres.sh` now performs only private file staging as the official
image's initial root user, then execs its unchanged entrypoint, which drops to
postgres. The SQL copy is postgres-owned/0600 in a private container directory.
The source realm remains host-private; its immutable copy is UID 1000-owned/0600
in the dedicated config volume, mounted read-only by non-root Keycloak. Existing
copies must match before reuse; a different source fails closed. No host chmod,
credential rotation, DB initialization or runtime privilege widening occurs.

`pnpm.cmd test:infra:bootstrap` executes the actual staging function against
synthetic files with Linux ownership: runtime access succeeds, host sources stay
0600/UID 1001, unrelated access is denied, repeat staging is idempotent, and
changed-source replacement is rejected. It also verifies live private SQL and
Keycloak import readability. Both CI infrastructure jobs run this regression.
Failed CI jobs now emit only safe status/lifecycle diagnostics; permission errors
are classified without printing filenames, SQL or authentication payloads.

The follow-up commit and observed CI results are recorded in the delivery report.
The original cold-restart report remains an honest record of the three data
volumes; the added private config-volume restart is recorded separately.


The [local follow-up record](../evidence/m2/dev-infra/posix-bootstrap-results.json)
confirms 156 validation tests, eight HTTP tests, five real Keycloak browser tests
and the new private-bootstrap regression passed. A second complete
[stop/start comparison](../evidence/m2/dev-infra/cold-restart-posix.json) passed
753 table/role comparisons across all 21 retained databases, unchanged private
realm-import contents, all **four** volume identities and 535 unexpired Redis
values/absolute expiries. The root bootstrap still hands PostgreSQL to UID 999;
Keycloak remains UID 1000. No credential, retained database, original volume,
backup, sibling file or unrelated primary change was replaced.
