# M1 local foundation and acceptance record

Scope: pnpm TypeScript workspace, NestJS/Fastify liveness API, React/Vite admin,
two Expo Router apps, shared tokens/UI/contracts, PostGIS/Redis Compose,
transactional local migration runner and Windows/Linux CI. No public deployment.

The repository arrived without Git metadata. A local `feat/m1-foundation` branch
was initialized; no commit, remote or PR was created. Blueprint documents and
original fare images are retained. Historical schemas remain reference-only.

## Windows setup

Use Node 22.17.0, pnpm 11.20.0, Python 3.12 and Docker Desktop Linux containers.
Use `.cmd` launchers in PowerShell; system execution policy can block `.ps1`
launchers. Android development additionally needs Android Studio/SDK, Java and
a USB-debugging device or emulator. Local iOS compilation needs macOS/Xcode.

```powershell
npm.cmd install --global pnpm@11.20.0
# On the first connected bootstrap only, resolve and review the lockfile:
pnpm.cmd install
# Commit pnpm-lock.yaml after compatibility checks and audit. Thereafter:
pnpm.cmd install --frozen-lockfile
# Copy only if .env does not already exist; preserve existing credentials.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Set NODE_ENV=development, matching local DB credentials, and TZ=UTC in .env.
# Edit POSTGRES_PASSWORD and URL together; URL-encode special password characters.
pnpm.cmd infra:up
pnpm.cmd db:up
pnpm.cmd db:up
pnpm.cmd db:verify
pnpm.cmd db:status
pnpm.cmd db:down
pnpm.cmd db:verify:rollback
pnpm.cmd db:up
pnpm.cmd db:verify
pnpm.cmd validate
pnpm.cmd mobile:check
pnpm.cmd mobile:doctor
pnpm.cmd mobile:export
pnpm.cmd audit:dependencies
```

Start each application in a separate terminal:

```powershell
pnpm.cmd dev:api          # http://127.0.0.1:4000/v1/health
pnpm.cmd dev:admin        # http://127.0.0.1:5173 (Vite proxies /v1)
pnpm.cmd dev:passenger    # Metro 8081, custom development client
pnpm.cmd dev:driver       # Metro 8082, custom development client
# Web smoke previews:
pnpm.cmd --filter @trissea/passenger web
pnpm.cmd --filter @trissea/driver web
# Build/install the separate Android development clients:
pnpm.cmd --filter @trissea/passenger android
pnpm.cmd --filter @trissea/driver android
```

API `dev` compiles once and watches compiled output. After TypeScript edits run
`pnpm.cmd --filter @trissea/api build` in another terminal; Node restarts on output
changes. No phone, OTP or location data is needed to check health. The API binds
loopback only; M1 mobile shells make no API calls and collect no location.

Verify health with `Invoke-RestMethod http://127.0.0.1:4000/v1/health`.
The response is `{status: "ok", service: "trissea-api", milestone: "M1",
bookingsEnabled: false}`. Health is process liveness, not dependency readiness.
`db:verify` checks actual database/PostGIS/UTC and Redis connectivity separately.

Shutdown: `pnpm.cmd infra:down` retains volumes. `db:down` removes only the latest
M1 migration's objects, in a transaction. PostGIS and the migration ledger remain.
M1 tooling refuses nonloopback or nondevelopment database targets. Never point it
at an existing city system. No historical/demo seed SQL is executed.

## Changes and security implications

- Migration `0001_foundation` installs PostGIS and adds only `foundation_metadata`.
  No users, tenants, TODAs, fares, bookings, GPS or identity documents are seeded.
  Drizzle declares the same metadata table; operational tables await M2 review.
- Migration history uses up/down checksums, advisory locking and one transaction;
  changed, missing and out-of-order applied migrations fail closed.
- Global guard requires provider-verified identity on every new API controller;
  only health opts out. The runtime identity provider denies all tokens. A test-only
  protected controller proves valid-token and negative flows. No auth endpoints yet.
- Authorization example matches city, TODA, permission and admin MFA, with no
  implicit platform bypass. It is not the complete M2 owner/case/duty policy.
- OTP simulator is in-memory, single-use, short-lived and refuses nondevelopment
  environments. It is not wired into HTTP or runtime auth and mints no tokens.
- No HTTP request/body logging; startup and tooling errors use generic messages.
  No new privileged operational actions exist. MFA/login integration remains M2.
- The MVP contract adds public health; the broad original contract is preserved.
  Reproducible generation emits all current MVP schema/operation types. Only the
  implemented health operation has a runtime client with response validation.
  The small generator rejects unsupported schema forms; extend it explicitly when
  the contract vocabulary expands. Future operation types are not implementations.

## Shell UX and review

Passenger hierarchy: preview notice, unavailable services and their reasons.
Driver hierarchy: offline preview, verification requirement, disabled online action.
Admin: unprivileged navigation preview, health retry and fare reference shell with
**Not yet approved** status; no import/approval mutation or numeric quote is shown.
There are three specified UI applications plus the API, not four UI applications;
the bootstrap phrase “four frontend shells” does not define a fourth product.

Mobile theme adapters derive from `design/tokens.json`, with light/dark roles,
48dp Android/44pt iOS action targets, safe areas, scrolling and scalable system
text. Status labels use text rather than color alone. No location permissions,
map tiles, credentials or telemetry are requested. All services remain unavailable
even offline. Transactional loading/expiry/reconnect states are N/A for these
static previews. Admin health has idle, pending, success and failure/retry states.

Reviewed against [screen acceptance](../design/MOBILE-SCREEN-ACCEPTANCE.md) and
[review checklist](../design/MOBILE-REVIEW-CHECKLIST.md). Automated contrast checks
cover actual normal-text, notice and action pairs. Native screen-reader traversal,
large text, Android screenshots, iOS safe areas and outdoor readability require
device evidence; no release signoff is claimed. Copy is centralized in shell
features; a translation catalog is not yet implemented.

The v1.5 M1 scope takes precedence over the earlier `22-EXPO-IMPLEMENTATION.md`
map/background-GPS gate. MapLibre compatibility and real GPS proofs stay in M5;
driver custom development build configuration is present but not device-validated.

## Validation record

Executed on Windows with Node 22.17.0 and validation tools recovered from the local
pnpm cache (not a complete workspace installation):

| Check | Result |
| --- | --- |
| ESLint across source | PASS |
| Contracts and design-token TypeScript checks | PASS |
| Compiled city/TODA/MFA policy and OTP tests | PASS, 4 tests |
| Compiled typed health-client tests | PASS, 2 tests |
| Migration target safety, contract reproducibility, contrast | PASS, 3 tests |
| Blueprint/JSON/YAML and original fare CSV structure | PASS |
| Docker Compose configuration syntax | PASS; daemon not contacted by this check |
| Full API typecheck/guard integration, admin/Expo builds | BLOCKED, required packages unavailable |
| Dependency audit | BLOCKED, no resolved lockfile |
| DB startup, migrations/rollback/reapply, Redis PING | BLOCKED, Docker daemon access denied |
| Native builds, UI boots, device/accessibility capture | NOT RUN |

M1 remains **in progress** until
the reviewed lockfile, full install, dependency audit, API integration tests,
database rollback/reapply, UI boots and Android development builds are evidenced.
CI deliberately refuses a missing lockfile; it must not resolve new versions on
each push. Dependency audit failures block CI and require reviewed fixes, never
automatic `audit fix`. `mobile:doctor` uses pinned Expo Doctor 1.20.2, verified in
cached package metadata; it must pass in a connected environment before signoff.

This execution environment denied outbound npm fetches (`EACCES`) and Docker daemon
access. Cached validation tools may support source checks, but are not evidence of
a complete resolved workspace install. No lockfile is fabricated. Windows commands
that require the unavailable services are documented, not reported as tested.
