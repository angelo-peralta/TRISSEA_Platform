# M2.5 — Keycloak administrator authentication

> Current local Docker workflow: [ADR 66](66-ADR-DEVELOPMENT-INFRASTRUCTURE.md), one persistent `trissea-dev` project. Earlier container/Compose commands below are historical execution evidence, not startup instructions.

> Environment setup update (Task 5A): use [the canonical configuration guide](65-ENVIRONMENT-CONSOLIDATION.md). Legacy dotenv names/commands below are historical acceptance evidence, not current setup instructions. Existing files remain pending explicit cleanup approval.

Date: 2026-11-06 PHT. Status: **COMPLETE — LOCAL/SYNTHETIC ENGINEERING ACCEPTANCE**.
M2 as a whole remains IN PROGRESS; stop before M2.6 for owner review.
Owner approved continuation after M2.4 `968e1d9`. Branch
`feat/m2-keycloak-admin` is stacked on the accepted local slices. Verified
`origin/main` remains merged M1 `553c5d7`. The original dirty planning checkout
is preserved. No push, PR, merge or deployment is authorized or performed.

## Implemented boundary

`services/api/src/auth/admin/` provides real Keycloak discovery, Authorization Code
with S256 PKCE, one-use state and nonce validation, signature/issuer/audience/time
validation, current TOTP assurance and opaque browser sessions. `openid-client`
6.8.9 and JOSE 6.2.15 handle protocols/cryptography. Cookie 1.1.1 provides parsing
and serialization; 2.0.1 was rejected because its export-only TypeScript types
are incompatible with the repository's existing Node/CommonJS module resolution.
Playwright 1.64.1 and OTPAuth 9.6.0 are development-only browser/TOTP test tools.
No mobile dependency or architecture replacement was introduced.

OpenAPI MVP v0.8.0 implements exactly five administrator operations:

| Operation under `/v1` | Boundary |
| --- | --- |
| POST `/admin/auth/login` | Exact Origin, bounded anonymous attempt, Idempotency-Key + in-memory random client proof; returns authorization URL and flow cookie |
| GET `/admin/auth/callback` | Browser binding, state/nonce/code/PKCE, signature and current MFA, immutable subject mapping; 303 to configured dashboard |
| GET `/admin/auth/session` | Own active application session, current account/mapping/factor; memory-only CSRF credential |
| POST `/admin/auth/logout` | Exact Origin + CSRF, transactional revocation/audit/outbox, clear app cookie |
| GET `/admin/access/todas/{todaId}` | Read-only permission probe: current TODA_MANAGER and same city/TODA grant, fresh password/TOTP; operations false |

No role assignment, invitation, password, OTP retrieval, recovery, verification
decision or operational mutation API is exposed. Keycloak roles never supply
TRISSEA grants. The existing default-deny guard handles absent, mixed, invalid,
expired or unconfigured credentials. Mobile bearer and administrator cookie
proofs remain separate. Combined activation requires the same physical
application database, with separate runtime logins, rather than parallel identities.

## Realm, clients and MFA contract

`infra/compose.m2-keycloak.yml` pins Keycloak 26.8.2 linux/amd64 to
`sha256:4340d05ee7d15be34293868d495ac772d61f1a4d0e43d53bae2e75e2f05de185`.
It has a separate tmpfs PostgreSQL service using the already reviewed M2
PostGIS/PostgreSQL image digest. It does not share a database, login, volume or
network project with M1 or TRISSEA's identity test DB. PostgreSQL has no host port.
Keycloak HTTP and management health bind only 127.0.0.1:18080/19000. `start-dev`
is restricted to this disposable synthetic environment. Management health is UP.

`infra/keycloak/realm-policy.mjs` and the explicit provisioning command configure:

- Realm `trissea-local`, required password and required TOTP executions, no
  Cookie/SSO/alternative provider execution. Every login requests `prompt=login`
  and `max_age=0`.
- TOTP SHA1, six digits, 30 seconds, zero look-ahead, code reuse prohibited.
  CONFIGURE_TOTP is the only enabled required action. No app access before enrollment.
- Confidential `trissea-admin-bff`: exact 5174 callback, code-only, S256 required,
  no direct/password/implicit/device grant, service account or refresh token.
  Standard `basic` scope supplies `auth_time`; email/profile supply verified-email
  proof. An AMR mapper reports successful password and OTP executions.
- Execution references use the pinned source's `default.reference.value` and
  `default.reference.maxAge` settings. The BFF requires signed `pwd` AND `otp`,
  never a generic ACR or role. Per-request reader calls check the exact required
  executions/configuration, current verified enabled subject, provider session,
  unchanged factor metadata and disabled recovery configuration.
- Separate `trissea-assurance-reader`: service credentials only, `view-users`,
  `query-users`, `view-realm` (view-users includes query-groups). The `roles` and
  `kc-admin-api` standard scopes encode its existing roles and required Admin API
  audience. They grant no additional management permissions. User updates, factor
  deletion and role changes must return 403.
- Registration, forgot-password, remember-me, reset flow, recovery codes,
  password reset required actions, account/account-console and broker clients
  disabled. Reset flow has a required deny execution. No recovery shortcut.

Reviewed pinned primary sources:
[AMR execution references](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/protocol/oidc/utils/AmrUtils.java),
[standard basic/Admin API scopes](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/protocol/oidc/OIDCLoginProtocolFactory.java),
[TOTP credential encoding](https://github.com/keycloak/keycloak/blob/26.8.2/server-spi/src/main/java/org/keycloak/models/credential/OTPCredentialModel.java),
[OTP validation/reuse prevention](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/credential/OTPCredentialProvider.java).

## Identity mapping and session lifecycle

Only an owner-controlled disposable test fixture provisions synthetic provider
users and an explicit internal KEYCLOAK identity/mapping approved by a different
internal user. Issuer + opaque subject is encrypted and HMAC-indexed. No email
matching, public staff registration, automatic realm-role mapping, default
TRISSEA administrator or delegation workflow exists. Generated Keycloak master
bootstrap credentials are local tooling credentials, never application privileges.
Real invitation ownership and privileged bootstrap remain Gate D review work.

0006 adds `admin_oidc_flows` and `admin_browser_sessions` to the existing identity
schema; migrations 0001–0005 and their ledger remain unchanged. State, browser
binding, IP, request, cookie, CSRF and factor lookups are keyed digests. Nonce,
PKCE verifier, provider ID token and original CSRF credential are AES-GCM sealed
with purpose-bound AAD. TOTP secrets/passwords remain with Keycloak, not TRISSEA.
The browser receives only a random 48-byte application credential in a host-only
HttpOnly cookie. No provider token is returned to the SPA or web storage.

Application cookie: SameSite=Strict, Path=/, absolute maximum one hour. Flow
cookie: SameSite=Lax, five minutes. Production configuration requires Secure
`__Host-` names; HTTP local cookies use distinct names and are development-only.
Admin idle timeout is 900 seconds, sensitive reauthentication freshness 300
seconds, configurable only within validated bounds. Activity never updates the
MFA authentication timestamp. Reauthentication performs password/TOTP again,
rotates the cookie and transactionally revokes the old app session. Logging out
revokes locally first; it does not depend on remote logout. Existing provider SSO
cookies cannot bypass the required login executions.

Flow initiation retry requires the original key, secret proof and same prior app
session binding. It returns the same still-live flow without another budget debit.
A callback is consumed before provider I/O; ambiguous exchange requires a fresh
flow, never replay. Logout replay is denied after revocation with no second mutation.
Initial flow limits: 20/IP/minute and 100/hour globally, database-backed and
serialized. Production abuse budgets and retention/cleanup require review.

DB restrictions, session revocation and grant changes are rechecked inside the
authorization transaction with current account/resource locks. Per-request
provider assurance is uncached; read-service credentials cache at most 30 seconds,
not factor state. Assurance proof is valid at most five seconds while local
transactions finish. Provider calls have bounded timeouts and fail closed. An
in-flight remote factor change cannot be atomically serialized with PostgreSQL:
this measured local design is **not** a production distributed revocation guarantee.
Production interruption/revocation bounds remain M2-A02 security approval.

## Reproducible local setup

Prerequisite: the separate M2 disposable PostgreSQL 15433 / Redis 16380 cluster
from doc 57. M1 15432 / 16379, databases and volumes stay untouched.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd keycloak:prepare
pnpm.cmd keycloak:up
pnpm.cmd keycloak:provision
pnpm.cmd admin:prepare
pnpm.cmd exec playwright install chromium
pnpm.cmd test:admin:auth
pnpm.cmd dev:admin:api
# In another terminal:
pnpm.cmd dev:admin:identity
```

The preparer writes `.env.local` and `.cache/m2-keycloak/` once with generated
noncommitted credentials; existing files are preserved. `admin:prepare` creates
an empty random disposable database through 0006 and a non-owner runtime login.
It creates no app user/grant. During this implementation the explicit
`--new-disposable` option replaced only our empty prototype's local URL after
checking its manifest and owner-visible zero-user count; its database and original
configuration were retained. It refuses populated or unrelated targets.

Tests create their own random manifest-checked database, synthetic realm users,
owner fixtures and non-owner application login. Tests reserve a single connection
for temporary schema comparison tables. Rollback/reapply runs only there. No
DROP DATABASE, Docker volume deletion, production migration or legacy SQL seed
execution occurs. Application sessions, audit/outbox history and test DBs remain
available locally; credentials/OTP seeds are excluded from evidence and Git.

New local commands explicitly load only `.env.local`. Existing M1 `.env` and
earlier M2 `.env.m2-*` commands keep their behavior. Process injection overrides
env files. Vite reads only its application environment; backend secrets have no
VITE_/EXPO_PUBLIC_ prefix. Production never loads `.env.local`, and the admin
runtime explicitly rejects production activation while Gate E is closed.

| Variable(s) | Owner / type / sensitivity / contract |
| --- | --- |
| NODE_ENV, M2_ADMIN_AUTH_ENABLED | API environment/boolean; production activation denied; ordinary M1 defaults off |
| ADMIN_SECURITY_MODE | API enum local-synthetic/production; must match NODE_ENV |
| ADMIN_ORIGIN | API exact origin; local 127.0.0.1:5174; HTTPS required by production contract |
| ADMIN_API_PROXY_TARGET | Vite server-only HTTP loopback target; 4000 default or 4102 isolated identity |
| API_PORT | API integer TCP port; local identity 4102 |
| KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID, KEYCLOAK_ASSURANCE_CLIENT_ID | API exact realm/client identifiers; local realm fixed, no master |
| KEYCLOAK_BFF_SECRET, KEYCLOAK_ASSURANCE_SECRET | API confidential secrets, separate generated values, minimum 32 characters, never frontend |
| KEYCLOAK_DB_OWNER_PASSWORD, KEYCLOAK_DB_PASSWORD | Compose identity-DB owner/runtime secrets, separate from operational DB |
| KEYCLOAK_BOOTSTRAP_USER/PASSWORD | Isolated local provisioning only; generated, not a default account; no production use |
| ADMIN_DATABASE_URL | API secret DSN, manifest-checked random local disposable DB, non-owner role |
| ADMIN_KEYS_FILE | API ignored generated key-container path; five separate 32-byte keys and key ID |
| ADMIN_IDLE_SECONDS, ADMIN_REAUTH_SECONDS | API integers; defaults/maxima 900/300, minima 60/30 |
| M2_PASSENGER_AUTH_ENABLED / M2_DRIVER_AUTH_ENABLED | Existing mobile flags; false in standalone admin mode; combined mode must share physical app DB |
| SMS_LIVE_ENABLED, RECOVERY_ENABLED, REAL_DOCUMENTS_ENABLED, OPERATIONAL_SERVICES_ENABLED | Existing booleans; all false; no new activation authority |

Safe `.env.example` and `.env.production.example` document names without client
credentials. Production DB/key custody, external secret provisioning, strong
TLS/hostname/proxy settings, private health/management, encryption at rest,
encrypted backups/restore drills, key/client-secret rotation, monitoring,
audit retention and incident handling are prerequisites, not accomplished by
local tmpfs containers or this slice. Container vulnerability scanning is not
claimed; npm dependency auditing is recorded separately.

## Acceptance evidence

Executed on Node 22.17.0, pnpm 11.20.0, Docker client/engine 29.8.0, Windows.
Final Keycloak run began 2026-11-06 02:11:40 UTC (10:11:40 PHT), duration
162.153 seconds. All 15 cases passed; none failed, cancelled or skipped.
This is actual local Keycloak integration, with synthetic accounts and TOTP seeds;
it is not simulated MFA, live SMS or production acceptance.

| Executed command | Actual result |
| --- | --- |
| `pnpm.cmd install --frozen-lockfile` | Exit 0; reviewed lockfile reproducible |
| `docker compose --env-file .env.local -f infra/compose.m2-keycloak.yml up -d --wait` | Exit 0; separate Keycloak/PostgreSQL healthy |
| `node --env-file=.env.local scripts/provision-keycloak-local.mjs` | Exit 0; exact flow/claim scopes/read-only account configured |
| `node --env-file=.env.local scripts/prepare-admin-database.mjs --new-disposable` | Exit 0; fresh empty disposable DB through 0006; earlier empty prototype/config retained |
| `pnpm.cmd validate` | Exit 0; contracts, lint, strict TS, **110 tests** (89 API + 8 clients + 13 repository), API and Vite builds |
| `pnpm.cmd test:identity:db` | Exit 0; 11 passed |
| `pnpm.cmd test:authorization:db` | Exit 0; 12 passed |
| `pnpm.cmd test:passenger:auth` | Exit 0; 15 passed; mock SMS only |
| `pnpm.cmd test:driver:auth` | Exit 0; 15 passed; synthetic intake only |
| `pnpm.cmd test:admin:auth` | Exit 0; 15 passed against real Keycloak/PostgreSQL/Fastify/Vite/Chromium |
| `pnpm.cmd audit --audit-level=moderate` | Exit 0; 0 moderate/high/critical; one existing low finding |
| `pnpm.cmd dev:admin:api`, `pnpm.cmd dev:admin:identity` | Startup verified, ongoing loopback 4102/5174 processes; proxy health 200, absent cookie 401 |
| `git diff --check` | Exit 0; prior migration source bytes unchanged |

Evidence: [commands](../evidence/m2/m2-5/commands.json),
[15-case provider/browser report](../evidence/m2/m2-5/keycloak-results.json),
[container health/digests](../evidence/m2/m2-5/container-status.json),
[dependency findings](../evidence/m2/m2-5/security-summary.json), and refreshed
identity/authorization/passenger/driver regression reports in the same folder.
GitHub Actions was extended with local Keycloak/Playwright setup and safe artifact
uploads. **Remote CI is NOT RUN**: this branch has not been published.

Positive and negative evidence covers verified synthetic email/password + TOTP,
wrong password/code, missing enrollment, unmapped/unverified identity, nonce/state/
browser/S256 failures, concurrent callback exactly one success (303/401), code and
TOTP replay/expiry, cookie rotation/old-cookie denial, CSRF/Origin, credential mixing,
positive same-TODA access, cross-TODA and removed-grant denial, removed factor,
provider suspension, app restriction, mapping/session revocation and revocation
during provider I/O. Actual Keycloak pause/unpause denies/restores requests;
DB/provider adapter failures also deny. Current runtime user context clears after
transactions, and persisted app/auth/audit rows contain no plaintext password,
TOTP seed, provider subject/token, cookie or CSRF credential.

Actual absolute session expiry is tested through HTTP. Fifteen-minute idle and
five-minute sensitive freshness use the policy clock with a genuine verified
provider proof; tests do not wait 15 minutes or claim a manual timed-browser pass.
Browser tests pace their common loopback IP to preserve the configured 20/minute
flow limit. A separately exhausted persisted budget returns 429/Retry-After.
Reader mutation/delegation requests return 403. Direct reset/action-token/account
requests deny; disabled registration may restart ordinary login with no registration
form. A requested disabled recovery-code action grants no application session.

Reviewed actual screenshots:
[Keycloak sign-in](../evidence/m2/m2-5/keycloak-sign-in.png),
[empty TOTP challenge](../evidence/m2/m2-5/keycloak-totp.png),
[authenticated desktop](../evidence/m2/m2-5/admin-desktop.png),
[390px browser](../evidence/m2/m2-5/admin-mobile.png),
[error/retry state](../evidence/m2/m2-5/admin-error.png).
No password, code, QR seed or provider token is visible. Username text is synthetic.
Keyboard focus, labels/status updates, loading-disabled controls, error/retry,
health proxy, absent horizontal overflow, unapproved fare reference and disabled
fare editing were checked. No page exceptions occurred. This is limited functional
browser QA, not a screen-reader, full WCAG, dark-mode/large-text or physical-device
acceptance claim. Native login/secure-storage and full M2 integration remain M2.7.

## Defects corrected and review findings

- Added Keycloak's standard basic scope for required auth_time, and kc-admin-api
  audience/role claim scopes for the existing least-privilege reader. Invalid
  provider configuration remained denied until corrected; MFA was never bypassed.
- Corrected cookie parsing to reject whitespace variants of duplicate cookie names.
- Redacted Vite proxy failure diagnostics, which otherwise included a callback
  query/code/state. An actual API-offline 502 regression confirms a sanitized log.
- Rollback now explicitly revokes column grants; tests prove it. Historical
  migrations 0001–0005 were not edited.
- Corrected synthetic TOTP BASE32 credential encoding and reserved schema-probe
  connections; paced tests instead of weakening real rate limits. Redirect-chain
  protocol tests hold the provider response to test real callback replay safely.
- Retained the existing low Expo `deepmerge` 4.3.1
  [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
  No broad mobile dependency upgrade was mixed into this identity slice.

No unresolved local acceptance failure remains. Production MFA/revocation bounds,
secret/key rotation, invitation ownership, retention, provider/container hardening
and external approvals remain required. Real documents and driver decision
workflows are unimplemented M2.6 work, not implied by successful administrator login.

## Closed external gates

A: live SMS; B/D16/D17: real documents, privacy/legal/retention; C: real city/TODA
driver authority; D: recovery, staff delegation and real bootstrap ownership;
E: public deployment and operations. All remain closed. `canGoOnline`, real
driver approval and operational services remain false. No M2.6 work begins
before owner review of this slice.
