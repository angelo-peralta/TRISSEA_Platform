# M1 local foundation and acceptance record

Scope: pnpm TypeScript workspace, NestJS/Fastify liveness API, React/Vite admin,
two Expo Router apps, shared tokens/UI/contracts, PostGIS/Redis Compose,
transactional local migration runner and Windows/Linux CI. No public deployment.

## Current acceptance status - 2026-11-05

**COMPLETE — local M1 engineering acceptance.** The existing native APKs are now
installed and running on both Android emulators. ADB screen, navigation, theme,
font-scale, scrolling and reopening checks passed; Playwright verified the admin
in Edge. The passenger emulator requires the documented software-rendering
workaround. Historical failures and remaining release limitations are retained
below. This is not public-release, physical-phone or background-GPS approval.

See the [final Android/browser execution](#final-android-and-browser-acceptance---2026-11-05)
and [indexed evidence](../evidence/m1/README.md).

This acceptance run inspected the existing Git metadata before changes:
`origin` is `https://github.com/angelo-peralta/TRISSEA_Platform.git`, baseline
`2fdff30` (`main`). It created local branch `chore/m1-acceptance` without changing
history or remotes. The pre-existing modified mobile skill and untracked
`docs/50-TRISSEA_GIT_AGENT_RULES.md` were preserved. No commit, push, PR or merge
was performed. Original blueprint policy, SQL references and fare images remain.
The earlier foundation run's repository initialization is historical, not an
operation repeated during acceptance.

## Windows setup

Use Node 22.17.0, pnpm 11.20.0, Python 3.12 and Docker Desktop Linux containers.
Use `.cmd` launchers in PowerShell; system execution policy can block `.ps1`
launchers. Android development additionally needs Android Studio/SDK, Java and
a USB-debugging device or emulator. Local iOS compilation needs macOS/Xcode.

The default commands below assume a new local development database and free
default ports. On this workstation, use the **isolated database execution**
commands below with `.env.m1.local`; its host database ports were already in use.

```powershell
npm.cmd install --global pnpm@11.20.0
# A reviewed lockfile is included. Normal setup must not resolve new versions.
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
cover actual normal-text, notice and action pairs. Android screenshots, large text,
native control bounds and accessibility state were checked in the final execution
below. Audible screen-reader traversal, iOS safe areas and outdoor readability
remain unverified; no public-release signoff is claimed. Copy is centralized in shell
features; a translation catalog is not yet implemented.

The v1.5 M1 scope takes precedence over the earlier `22-EXPO-IMPLEMENTATION.md`
map/background-GPS gate. MapLibre compatibility and real GPS proofs stay in M5;
driver custom development build configuration is validated on an x86_64 emulator;
physical-phone/native background-GPS reliability is not claimed.

## Acceptance execution record - Windows, 2026-11-05

| Check | Actual result |
| --- | --- |
| Node / pnpm / npm | 22.17.0 / 11.20.0 / 11.18.0 |
| Docker Desktop / Engine / Compose | 4.91.0 / 29.8.0 / v5.5.1; Linux daemon reachable |
| Workspace installation | PASS, all eight workspace projects; strict peer checks retained |
| Frozen lockfile install | PASS online and offline, unchanged SHA-256; 760 registry packages all have integrity hashes, no custom Git/tarball sources |
| `pnpm.cmd validate` | PASS: reproducible contracts, ESLint, all workspace TypeScript checks, 18 tests, API and admin builds |
| Unit/integration breakdown | 2 generated-client tests, 7 API/policy/OTP/guard tests, 9 foundation/dependency/native configuration/path tests |
| `pnpm.cmd mobile:check` | PASS for passenger and driver |
| `pnpm.cmd mobile:doctor` | PASS, 21/21 checks for each app |
| `pnpm.cmd mobile:export` | PASS, both production web bundles |
| `pnpm.cmd audit:dependencies` | PASS at the existing moderate threshold: 0 critical/high/moderate; 1 low remains, documented below |
| Original blueprint and fare transcription checks | PASS; no legal approval inferred |
| Database migration apply, repeat apply, down and up | PASS against the dedicated acceptance database only |
| Database/PostGIS/UTC and Redis | PASS; PostgreSQL 17.5, PostGIS 3.5.2, UTC, Redis 7.4.12 PONG |
| API and Vite startup | PASS; health and proxied typed health HTTP 200, admin HTML HTTP 200 |
| Both Expo dev-client servers | PASS; Metro status and Android manifests HTTP 200 |
| Native APK compilation | PASS, both x86_64 development APKs; package metadata and signatures verified |
| Device install/launch tests | PASS in final execution: separate APKs, Metro, navigation, screenshots and reopening on emulator-5554/5556 |
| Browser visual/interaction check | PASS in final execution: Playwright/Edge desktop and mobile widths, health/loading/error/retry and fare restrictions |
| GitHub Actions Windows/Linux matrix | Workflow configured; not executed remotely in this session; no publication authorized |

`pnpm-lock.yaml` SHA-256 after frozen reinstall:
`0F42E31498A43CF18767DE0D26024352B1C4FB3BE1BFCA392B29EFEF72DEC3C3`.
All dependencies and the query-string patch are versioned in the lockfile.

### Isolated database execution and preservation

Host ports 5432 and 6379 were already occupied before this run. They were not
stopped or reconfigured. Compose now accepts `POSTGRES_PORT` and `REDIS_PORT`,
with the original defaults unchanged. Acceptance used a new Compose project
`trissea-m1-acceptance`, database `trissea_m1_acceptance`, user `trissea_m1`,
loopback Postgres port **15432** and Redis port **16379**. A generated local-only
password is in ignored `.env.m1.local`; the original `.env` was not overwritten.
No real users or production credentials were created.

Successfully executed, in this order:

```powershell
docker compose --env-file .env.m1.local -p trissea-m1-acceptance -f infra/compose.yml up -d --wait
node --env-file=.env.m1.local scripts/migrate.mjs status
node --env-file=.env.m1.local scripts/migrate.mjs up
node --env-file=.env.m1.local scripts/migrate.mjs up
node --env-file=.env.m1.local scripts/verify-infra.mjs
node --env-file=.env.m1.local scripts/migrate.mjs down
node --env-file=.env.m1.local scripts/verify-infra.mjs --rolled-back
node --env-file=.env.m1.local scripts/migrate.mjs up
node --env-file=.env.m1.local scripts/verify-infra.mjs
node --env-file=.env.m1.local scripts/migrate.mjs status
```

Evidence: `0001_foundation: pending` before apply; `Applied 0001_foundation`;
repeat apply exited 0 without another ledger entry; `Rolled back 0001_foundation`;
rollback probe verified the foundation table was absent, ledger empty and PostGIS
retained. Reapply restored exactly one ledger entry with a 64-character checksum.
A synthetic table `acceptance_guard.preserved`, deliberately outside migration
ownership, retained row `(1, 'synthetic-preservation-check')` across down/up.
Direct SQL returned database `trissea_m1_acceptance`, timezone `UTC`, PostGIS
`3.5.2`; `redis-cli ping` returned `PONG`. Both containers were healthy.

Only this dedicated database was migrated. No database or Docker volume was
deleted. Acceptance volumes and the preservation sentinel remain for inspection.
Do not run the default `.env` rollback against an unrelated local database.

### Dependency and lockfile review

The first connected install exposed invalid Expo peer resolutions and the initial
audit reported 21 findings. Compatibility checks guided the SDK **57** patch update:
Expo 57.0.31, Router 57.0.29, React Native 0.86.3, SDK-matched Reanimated 4.5.1 and
Worklets 0.10.1. React remains 19.2.3. Added SDK-matched `expo-system-ui` 57.0.4
for the apps' existing automatic theme configuration. Nest packages are 11.2.8;
Vite is 8.2.4. This does not implement M2 or change product policy.

Reviewed security overrides in `pnpm-workspace.yaml` pin Fastify 5.12.6,
find-my-way 9.7.0, decode-uri-component 0.5.1, Expo CLI's Zod 4.6.7, vulnerable
Glob 9+ consumers to 14.0.2 and vulnerable Minimatch 7+ consumers to 11.0.1.
The two-line `query-string@7.1.3` patch adapts its CommonJS import to the patched
ESM decoder's default export; query-string's public API is retained. Expo CLI's
actual Zod call sites use compatible object/string/enum/union/array APIs.
`tests/dependency-compatibility.test.mjs` exercises those real installed consumers,
including malformed percent input, valid/invalid plugin data and glob matching.
All typechecks, server guard tests, native JS bundles and web exports must remain
green when these overrides change. No automatic `audit fix` or audit exclusions
were used. `verifyDepsBeforeRun: error` prevents competing implicit installations
when starting multiple dev servers; install explicitly before running scripts.
`enableGlobalVirtualStore: false` makes pnpm's development and CI dependency-state
checks agree and keeps native source paths in the configured local short store.

The remaining **low** advisory is `deepmerge` 4.3.1 prototype poisoning via Expo
configuration processing (audit ID 1243505). The advisory names >=4.3.2, but the
registry's latest published version was still 4.3.1 at review time. It is not
hidden or treated as fixed. Only trusted repository configuration is used in M1;
recheck upstream and audit before release. The configured moderate threshold
passes; a zero-findings claim would be false.

### Application startup evidence

Successfully started `pnpm.cmd --filter @trissea/api start`, `pnpm.cmd dev:admin`,
`pnpm.cmd dev:passenger` and `pnpm.cmd dev:driver`. API/admin were built first.
API received process-local `NODE_ENV=development` and `API_PORT=4000`; Expo
validation used `CI=1` and `EXPO_NO_TELEMETRY=1` only for those processes.

| Surface | Evidence |
| --- | --- |
| API `http://127.0.0.1:4000/v1/health` | HTTP 200; generated typed client validated `status=ok`, `milestone=M1`, `bookingsEnabled=false` |
| Admin `http://127.0.0.1:5173/` | HTTP 200; TRISSEA title and `/src/main.tsx` entry present |
| Admin `/v1/health` proxy | HTTP 200; the same generated typed client validated the response |
| Passenger `http://127.0.0.1:8081/status` | HTTP 200, `packager-status:running`; Android manifest identifies `trissea-passenger` |
| Driver `http://127.0.0.1:8082/status` | HTTP 200, `packager-status:running`; Android manifest identifies `trissea-driver` |

Metro-served Android JavaScript bundles returned HTTP 200 from the actual manifest
launch URLs after the final restart: passenger 6,377,055 bytes and driver 6,378,154
bytes. These are separate
from the successful web exports. Browser click/render assertions, native
screen-reader traversal and device screenshots have **not** passed by implication.
No live sign-in, driver shift, location, fare or booking is enabled.

Final development processes remain running on API 4000, admin 5173, passenger
Metro 8081 and driver Metro 8082. Metro was restarted using
`pnpm.cmd --filter @trissea/passenger dev --max-workers 2` and the equivalent
driver command. Both Android manifests and JS bundles returned HTTP 200. The
admin HTML and transformed `/src/main.tsx` and `/src/shell.tsx` modules also
returned HTTP 200. This is HTTP/bundle evidence, not a browser render assertion.

### Android build and device evidence

Android Studio and SDK exist at the standard local paths. The system Java is 23;
this run selected Android Studio's bundled OpenJDK **21.0.3** through process-local
`JAVA_HOME` and set `ANDROID_HOME` for native build commands only. Existing SDK
platform 34/build-tools 34 and 35 are not the SDK 36 toolchain required by Expo 57.

Both `expo prebuild --platform android --no-install` commands passed. Generated
`apps/*/android` and `apps/*/ios` directories are ignored CNG output; app.json and
the lockfile remain the source. Gradle 9.3.1 downloaded and executed. Android's
existing accepted licenses allowed installation of SDK/platform 36, build-tools
36.0.0 and NDK 27.1.12297006. Existing SDK components were retained.

The initial multi-architecture build was cancelled under memory pressure. The
two-worker, x86_64 retry reached Kotlin/Java/Dex and native CMake compilation, then
failed at `react-native-worklets:buildCMakeDebug[x86_64][worklets]` with CMake's
217-character object directory warning and `ninja: error: manifest 'build.ninja'
still dirty after 100 tries` (`BUILD FAILED in 8m 55s`). This is not an APK pass.

Added source-controlled Expo plugin `plugins/with-android-short-paths.cjs` and the
SDK-matched config-plugins 57.0.11 dev tool. Both app configs apply it. On Windows,
it sets library CMake staging to app-local `android/.cxx/<module>` instead of
pnpm's long dependency directory. App CMake staging uses the shorter workspace
`.c/p/a` (passenger) and `.c/d/a` (driver), with explicit plugin app keys. This uses
Android's documented [buildStagingDirectory](https://developer.android.com/reference/tools/gradle-api/8.11/com/android/build/api/dsl/Cmake#buildStagingDirectory)
API, keeps generated paths inside ignored workspace output directories, separates the two apps'
native outputs and survives prebuild regeneration. Both prebuilds passed after
the plugin was added. The next build passed Worklets and other library CMake
steps, but failed at `:app:buildCMakeDebug[x86_64]`: Ninja rejected Reanimated's
generated `ComponentDescriptors.cpp` source filename as longer than 260
characters (`BUILD FAILED in 6m 31s`).

Set pnpm's workspace-local `virtualStoreDirMaxLength` to 32 as well. Existing
generated dependency directories were moved into ignored
`.cache/m1-long-path-dependencies` after validating workspace boundaries; none
were deleted. A fresh frozen **offline** installation reconstructed all packages
with no version or lockfile changes. The formerly failing generated source path
now measures **237** characters. `tests/native-paths.test.mjs` checks the installed
codegen paths for both apps on Windows to catch regression. Both CNG prebuilds
passed again. One further attempt exposed a long Gesture Handler object path
under app codegen. The final app staging paths above shortened that object
filename to **239** characters. Native configuration tests verify callback order,
preservation of existing Gradle content, regeneration idempotency and separated
app output paths. No Windows-wide long-path/registry settings were changed.

The passenger x86_64 development APK then built successfully:
`BUILD SUCCESSFUL in 2m 47s`. Android build-tools verified its signature (exit 0).
`aapt dump badging` confirmed package `ph.trissea.passenger.dev`, label
`TRISSEA Passenger Dev`, min SDK 24, target/compile SDK 36 and ABI `x86_64`.
Artifact: `apps/passenger/android/app/build/outputs/apk/debug/app-debug.apk`,
89,258,967 bytes, SHA-256
`241B9509D682AB0143F09C0BC54665947B431A9E6891DF40305FEBEC5D469E8E`.
The driver x86_64 development APK built with `BUILD SUCCESSFUL in 8m 6s`.
Signature verification exited 0. Android metadata confirmed
`ph.trissea.driver.dev`, label `TRISSEA Driver Dev`, min SDK 24, target/compile SDK
36 and ABI `x86_64`. Artifact:
`apps/driver/android/app/build/outputs/apk/debug/app-debug.apk`, 89,242,505 bytes,
SHA-256 `A7AE75930BA48C65227E5A204B3259A006E911127941A1016D2ABA0C48D206FC`.

Successfully executed for each app (process-local environment, then its Android
directory):

```powershell
$env:NODE_ENV='development'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat app:assembleDebug --no-daemon --max-workers=2 --console=plain -PreactNativeArchitectures=x86_64
```

Then successfully reran each app's source-config prebuild with
`expo prebuild --platform android --no-install --no-clean`. SDK 57 defaults to
recreating native folders; **use `--no-clean` to preserve existing generated build
outputs during incremental work**. The Gradle source-plugin output and both APK
SHA-256 hashes remained byte-identical after that prebuild. Native configuration
unit tests also passed. APKs are local ignored artifacts, not committed binaries.
These are emulator-architecture **debug development clients**, not ARM/physical
phone builds or release-signed applications.

During the initial build phase, `adb devices -l` reported no connected devices
and `emulator -list-avds` returned no configured AVDs. WHPX acceleration was usable; an API
35 system image exists, but that is not an installed test device or configured AVD.
No physical-device/background-GPS reliability is claimed (M5).

### Acceptance gates resolved by the final execution

Emulator installation/launch and browser/mobile visual evidence are now available
below. The prior absence of devices and denied Computer Use access are historical;
the user authorized direct ADB and Playwright testing. No mandatory local M1 gate
remains open. Track the low dependency advisory and the emulator GPU workaround.
Physical-phone, audible TalkBack, iOS, outdoor and background-GPS checks remain
outside this local foundation signoff. An ARM phone needs an appropriate ABI build.

### Git handoff

Final branch: `chore/m1-acceptance`, HEAD remains `2fdff30`. Remote remains the
intended `angelo-peralta/TRISSEA_Platform`. The working tree is intentionally
dirty: task-scoped changes and the two pre-existing user changes are preserved.
Nothing is staged; there is no task commit, push, PR or merge. `git diff --check`
passes (Windows line-ending notices are warnings, not failed checks). `.env`,
`.env.m1.local`, native output directories and APKs are ignored. Fare transcription,
original fare images, the broad OpenAPI contract and legacy SQL references are
unchanged. Docker volumes and existing host database services were not deleted
or reconfigured.

## Final Android and browser acceptance - 2026-11-05

Re-read the binding pilot/agent/bootstrap, milestone, mobile-design and Git rules.
Reused `chore/m1-acceptance` and all existing code/dependencies/native APKs. No M2
endpoint, authentication, booking, fare calculation, driver onboarding or GPS code
was added. Changes in this final QA pass are limited to mobile preview labels/tab
accessibility, the admin favicon, and acceptance evidence/documentation. No migration
or backend infrastructure operation was repeated; the dedicated PostGIS/Redis
ports **15432/16379** and the earlier preservation/connectivity evidence stand.

### Android environment and configuration

| Component | Observed result |
| --- | --- |
| Android Studio | Rabbit 2 / 2026.2.2, `AI-262.10968.63.2622.16730706`, installed under `C:\Program Files\Android\Android Studio` |
| SDK root | `%LOCALAPPDATA%\Android\Sdk` |
| SDK platforms / build tools | Platforms 34 and 36; build tools 34.0.0, 35.0.0, 36.0.0; SDK 36 platform revision 2 |
| Platform tools / ADB | 37.0.1-15733141 / 1.0.41 |
| Emulator / acceleration | 37.2.13.0 build 16740729; WHPX installed and usable |
| Command-line tools | Installed official Windows bundle 15859902, revision 22.0; `sdkmanager --version` returned 22.0; current Android CLI 1.1.16717390 enumerated all three AVDs |
| Java / Gradle | Bundled OpenJDK 25.0.4; project wrapper `gradlew.bat --version --no-daemon --console=plain` passed with Gradle 9.3.1 |
| Passenger AVD | `Pixel_10a_Passenger`, directory `Pixel_10a.avd`, serial `emulator-5554`; earlier process/window name was `Pixel_10a` |
| Driver AVD | `Pixel_10a_Driver`, serial `emulator-5556` |
| Both AVDs | Google Play Android 17 / API 37, codename `REL`, x86_64, four cores, physical 1080×2424 at 420 dpi (411 dp width) |
| Memory | AVD files specify 2048 MB; emulator explicitly increases runtime RAM to 4096 MB for this image |

Verified the SDK before setting user-level `ANDROID_HOME` and appending only
`platform-tools`, `emulator` and `cmdline-tools\latest\bin` to the existing user
PATH. Existing PATH entries, Java installation and global Java selection were
preserved. Use process-local `JAVA_HOME` for Android commands; open a new terminal
to inherit the user PATH. Java 25 is supported by Gradle 9.1+ according to the
[Gradle compatibility matrix](https://docs.gradle.org/current/userguide/compatibility.html).
The reused APKs were built earlier with JDK 21; no native dependency changed here
and no unnecessary rebuild was performed.

The missing command-line tools were downloaded from
[Google's official SDK distribution](https://developer.android.com/studio#command-tools),
`https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip`.
SHA-256 matched the published value
`90AE805D20434428BFFCB699C290860F19BB5F66A67E6B330067E3DE801FB04A`
before extraction. The initial PowerShell download stalled; a resumed `curl.exe`
download completed and checksum verification passed. Existing SDKs, images,
licenses, the platform-tools backup and all AVD user data were retained. No new
system image or AVD was needed. The CLI's `--no-metrics` flag was used for subsequent
inspection; no Android CLI skills/init workflow was installed.

Legacy `avdmanager list avd` emitted device-catalog warnings for Pixel 10a and
missing image `devices.xml` files. `sdkmanager` also reported the pre-existing
platform-tools backup. The supported current `android --no-metrics emulator list`
and `android --no-metrics sdk list` worked; the actual emulator boots/installs below
validate the devices. These legacy-tool warnings were not silently described as
a clean legacy `avdmanager` pass.

### Actual installation, launch and Metro commands

Both emulators initially returned `sys.boot_completed=1`. APK `aapt dump badging`
and permission inspection confirmed the earlier package metadata and unchanged
SHA-256 hashes recorded above. The apps have distinct IDs, schemes and Metro ports.

Successfully executed (each device operation used an explicit serial):

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb -s emulator-5554 shell getprop sys.boot_completed
& $adb -s emulator-5556 shell getprop sys.boot_completed
& $adb -s emulator-5554 install -r apps/passenger/android/app/build/outputs/apk/debug/app-debug.apk
& $adb -s emulator-5556 install -r apps/driver/android/app/build/outputs/apk/debug/app-debug.apk
& $adb -s emulator-5554 reverse tcp:8081 tcp:8081
& $adb -s emulator-5556 reverse tcp:8082 tcp:8082
& $adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW -d 'trissea-passenger://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' ph.trissea.passenger.dev
& $adb -s emulator-5556 shell am start -W -a android.intent.action.VIEW -d 'trissea-driver://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082' ph.trissea.driver.dev
```

Both installs returned `Success`; both activities returned `Status: ok`. Reused
the already-running Metro processes started by the earlier documented pnpm
commands. Their actual Android bundles contained the final preview changes.
Native logcat recorded `Running "main"` and Metro loading from the correct port.
Final `/status` responses were HTTP 200 `packager-status:running` for both ports.
No location permission appears in either APK's requested permissions; neither
preview requested location, created a booking, started a shift or dispatched an offer.

ADB captures used binary `exec-out screencap -p` through Node buffers, not PowerShell
text redirection. Native `uiautomator dump` files were read back from unique device
paths; stale/unavailable dumps and non-app windows were rejected by the final
harness. Some cold-start UI dumps initially returned a null root; readiness retries
then observed the actual application. Screenshot/command/harness records are in
[evidence/m1](../evidence/m1/README.md).

### Defects found and corrected

| Finding | Result |
| --- | --- |
| Literal `?` separators in service/offline labels | Replaced with UTF-8 middle dots; actual screenshot and hierarchy text verified |
| Missing-glyph default tab icons | Replaced with native text labels using the shared token type scale; no icon dependency added |
| Clipped large-font default labels / undersized padded tab hit areas | Shared tab options allow wrapping, derive height from font scale and bottom safe-area inset, and retain the full hit area; final native tab heights are about 58 dp at normal scale, above 48 dp |
| Admin favicon HTTP 404 in the first browser run | Added a local SVG favicon; final browser run had no unexpected console errors |
| Passenger ANRs with host rendering | Preserved two real ANR reports and a dialog screenshot; applied and tested the software-rendering workaround below |

The first passenger ANR stalled while SoLoader loaded native libraries; another
waited in `android::uirenderer::renderthread::DrawFrameTask::drawFrame`. Its original
renderer was NVIDIA host OpenGL. No claim is made that the root GPU/driver issue
was fixed in application code. Closed only that AVD with `adb -s emulator-5554 emu kill`,
waited for its process to exit, and restarted the same user-data directory with:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_10a_Passenger -port 5554 -gpu software -no-snapshot-load -no-snapshot-save
```

The actual launch used `Start-Process -WindowStyle Hidden` with those arguments
and redirected diagnostic output into ignored `.cache/`. A first retry encountered
the old instance's shutdown lock; waiting and retrying resolved it without deleting
lock files or data. One too-early activity attempt was rejected during boot; launch
was retried only after `sys.boot_completed=1`. The successful cold boot took about
77.5 seconds. `dumpsys SurfaceFlinger` then confirmed Google SwiftShader.

Tested the resource-intensive matrices one AVD at a time with explicit
`adb -s <serial> emu avd stop/start` pause/resume commands. Both AVDs were resumed
at completion. Default physical size/density, font scale 1.0 and light mode were
restored. No app data, emulator data, database or Docker volume was wiped.

Initial dev-client logcat also contained a caught optional `SplashScreenManager`
lookup failure and ReactHost startup soft diagnostics; the SDK catches the absent
optional splash-screen class. The first passenger launch logged a React mounting
warning. These initial diagnostics are retained, not relabeled as zero log errors.
The final two normal-launcher cold starts for each app logged JavaScript `main`,
no ReactNativeJS errors and no fatal exceptions. No dependency was changed merely
to suppress debug-tool diagnostics.

### Native UI and accessibility execution

| Check | Actual final result |
| --- | --- |
| Passenger Home / Activity / Account | PASS; all tabs navigate and expose selected state; preview/empty states only |
| Four passenger services | PASS; Regular unavailable, Shared OFF, Special OFF, Reservation Coming later; all reachable by scrolling |
| Driver Home / Trips / Earnings / Profile | PASS; all tabs navigate, offline/verification copy visible, no operational data |
| Go Online | PASS; native button `enabled=false`, disabled action remained unchanged after a test tap |
| Light/dark | PASS; actual phone captures for both apps; PNG background samples matched `#F7F9FA` / `#102A43` |
| Screen/font matrix | PASS for each app: 360 dp normal/light, 600 dp normal/light, 600 dp 200% font/dark; additional 411 dp and 360 dp large-font captures retained |
| Scrolling / safe areas / text | Inspected actual images and hierarchies; bottom service/control content reachable, labels wrap at large text, no inaccessible fixed-height content found in tested states |
| Touch targets / semantics | PASS for tested native bounds, tab names/selected state and disabled online button; source header roles and contrast tests reviewed |
| Background and normal launcher reopen | PASS for each app |
| Two cold normal-launcher reopens each | PASS; passenger activity starts 4.798s / 5.210s; driver 19.587s / 5.511s; JS readiness checked separately from activity timing |
| ANRs after workaround | Passenger historical count remained 2→2; driver 0→0 across reopening and final paired-running verification |
| Physical phone / audible TalkBack / iOS / outdoor / GPS | NOT TESTED; not claimed by this local M1 signoff; required before the corresponding release/device gates |

Screenshots are unedited ADB captures. The floating gear belongs to Expo's development
client. M1 screens contain no forms, live map, quote, booking, OTP or telemetry;
transactional recovery, keyboard validation and GPS permission flows are N/A here.
Accessibility signoff is limited to the observations above, not a claimed manual
screen-reader or public-release certification.

### Admin browser execution

Playwright was initially absent. Reviewed official npm metadata for **1.64.1**
(Node >=20 and registry integrity) and installed it only under ignored
`.cache/m1-browser` using `npm.cmd install --prefix .cache/m1-browser --no-save
--package-lock=false --ignore-scripts playwright@1.64.1`. Workspace manifests,
working dependencies and the reviewed pnpm lockfile were unchanged. Used the
existing installed Edge **156.0.4314.58** in a fresh headless browser context.

The actual browser rendered the dashboard at **1440×900**, **390×844** and
**360×740**. All nine navigation entries worked at each width, `aria-current`
updated, native browser button rectangles were at least 48×48 px, and no horizontal
overflow was found. Fare Management showed **Not yet approved**, no active schedule
and a disabled import/approval button; other operational sections remained previews.

Tested the actual Vite `/v1/health` proxy against the running API (HTTP 200,
`bookingsEnabled=false`). A deliberately held request displayed loading/disabled
state and issued one request. A browser-intercepted HTTP 503 produced the error
state; removing the intercept and retrying reached the real API successfully.
No backend process or database needed to be stopped. The only console error in the
final run was the intentionally induced 503; there were **zero unexpected console
errors and zero page exceptions**. See [browser results](../evidence/m1/admin-results.json).

### Final checks and handoff

Successfully executed in this QA pass:

```powershell
pnpm.cmd validate
pnpm.cmd mobile:check
pnpm.cmd mobile:doctor
pnpm.cmd audit:dependencies
pnpm.cmd audit --audit-level=moderate --json
python scripts/validate_blueprint.py
git diff --check
```

Final validation passed contracts, ESLint, all workspace TypeScript, **18 tests**,
and API/admin production builds. Mobile dependency checks passed for both apps;
Expo Doctor passed **21/21 each**. A temporary tab callback type mismatch found
during iteration was fixed using React Native's `ColorValue`; the final validation
log is [validate-final.txt](../evidence/m1/validate-final.txt).
Final blueprint validation passed (2471 source files scanned), documentation
links/evidence result files were checked, and final phone PNG pixels confirmed
both actual themes. `git diff --check` passed; CRLF conversion notices are warnings.

The moderate audit policy passed with **0 critical/high/moderate and 1 low**.
The additional all-severity audit intentionally exited 1 for deepmerge advisory
1243505; it is not a zero-findings pass. npm still reported latest deepmerge 4.3.1
while the advisory requires >=4.3.2. No audit threshold/exclusion was changed.
The pnpm lock SHA-256 is still
`0F42E31498A43CF18767DE0D26024352B1C4FB3BE1BFCA392B29EFEF72DEC3C3`.

Final paired-running evidence confirms both apps on their separate emulators,
both Metro reverse mappings, restored display settings and HTTP 200 for API and
the admin proxy. API/admin/Metro ports **4000/5173/8081/8082** remain running.
See [final running state](../evidence/m1/final-running-state.json).

**M1 COMPLETE for the local foundation.** No mandatory local M1 blocker remains.
Retain the passenger software-rendering launch command, low advisory tracking,
legacy AVD-tool catalog warning and untested physical/audible-accessibility/iOS/GPS
limits. None authorizes public rollout or M2 implementation. Remote GitHub Actions
were not executed or claimed as passing.

Git remains `chore/m1-acceptance` at `2fdff30`, origin unchanged. All original dirty
work and the user's mobile-skill/Git-policy edits are preserved. Nothing is staged;
no commit, push, PR, merge, identity change or history rewrite occurred.

## GitHub submission review - 2026-11-05

The no-publication statements above describe the earlier local acceptance run.
The owner subsequently authorized an M1 commit, feature-branch push and draft PR
to `main`, with no merge. Before submission, `origin/main` and the local branch
were both at the original `2fdff30` baseline; fetch found no divergence and no
existing PR for `chore/m1-acceptance`.

Submission rechecks passed `pnpm.cmd validate` (18 tests, lint, TypeScript,
contracts and API/admin builds), `mobile:check`, `mobile:doctor` (21/21 per app)
and the unchanged moderate audit policy (one disclosed low finding). The existing
local database and emulator evidence was reviewed; no migrations or production
operations were repeated. GitHub CI status must be read from the submitted PR,
not inferred from these local results.

The public evidence set contains selected screenshots, native accessibility
hierarchies, reviewed test output, command/harness records and short ANR excerpts.
Full host/device dumps, intermediate captures, failed iterations and local Git
snapshots remain untracked. The pre-existing user mobile-skill/Git-policy changes
and Expo-generated local metadata are excluded from the M1 commit and preserved.
Only the nonsecret `.env.example` template is eligible; actual environment files,
SDK/native build outputs, APKs, caches and identity documents are excluded.

`.gitattributes` retains LF bytes for the reviewed lockfile and package patch on
Windows/Linux checkouts, preserving patch integrity and the documented lock hash.
The PR and final handoff report the resulting commit, push and CI evidence.

### First GitHub CI run and Windows checkout correction

M1 commit `3984620` was pushed to `origin/chore/m1-acceptance`; draft
[PR #1](https://github.com/angelo-peralta/TRISSEA_Platform/pull/1) targets `main`.
PR run `41994028930` passed its isolated infrastructure migration/rollback job.
Windows failed the generated-contract check because checkout converted generated
TypeScript output to CRLF; matrix fail-fast cancelled the Linux export step after
its validation/mobile checks had passed. These are failed/cancelled results, not
a complete CI pass.

Reproduced the exact contract-drift failure in a fresh `core.autocrlf=true`
checkout-index export. Added scoped LF attributes for both generated contract
outputs, preserving strict byte comparisons. The corrected fresh export passed
`generate-contracts.mjs --check`. Set matrix `fail-fast: false` to retain independent
Windows/Linux evidence on subsequent failures. No application or database behavior
changed; the follow-up commit is verified by its new PR CI run.
