# M2.7 — Integration, security and local acceptance

> Current local Docker workflow: [ADR 66](66-ADR-DEVELOPMENT-INFRASTRUCTURE.md), one persistent `trissea-dev` project. Earlier container/Compose commands below are historical execution evidence, not startup instructions.

> Environment setup update (Task 5A): use [the canonical configuration guide](65-ENVIRONMENT-CONSOLIDATION.md). Legacy dotenv names/commands below are historical acceptance evidence, not current setup instructions. Existing files remain pending explicit cleanup approval.

Status: **COMPLETE — LOCAL/SIMULATED ENGINEERING ACCEPTANCE**.
Record finalized 2026-11-09; execution evidence is dated 2026-11-06 and 2026-11-08.
Owner review is pending. M2.0–M2.6 were accepted before this slice. No production
readiness, GitHub publication, deployment or M3 implementation is authorized.

On 2026-11-09, M2 development moved back to the original `TRISSEA_Platform`
folder on `test/m2-security-acceptance`, preserving the original dirty changes.
The [primary folder handoff](64-M2-PRIMARY-WORKTREE-HANDOFF.md) records the transfer,
new validation/browser results and retained local backups. Evidence below records
the original M2.7 acceptance run; it has not been relabeled as a new Android run.

## Implemented scope

- `packages/mobile-auth`: purpose-bound passenger/driver session controller,
  generated-SDK transport, native Crypto/SecureStore adapter and shared identity
  screen. Account/Profile tabs support mock OTP, explicit synthetic consent,
  current profile, pending driver verification, retry and confirmed sign-out.
- Access JWTs, phone/code drafts and profiles remain in memory. Each app stores
  only versioned, purpose/API-bound device proof and rotating refresh material in
  its own native secure store. Android backups exclude SecureStore; iOS is
  configured for device-only unlocked keychain storage, without biometric recovery.
- Refresh requests are serialized and persist their request key before sending.
  Same-request recovery is bounded to 10 seconds inside the server's 15-second
  window. Older uncertain outcomes require sign-in; local clearing alone is not
  claimed as server revocation. Pending logout survives cold native restarts and
  must finish before private navigation resumes. Background/outage states hide
  private profile content.
- Admin assigned-case review uses existing contracts, current PostgreSQL grants,
  Keycloak/TOTP browser sessions, CSRF/Origin checks and exact case/evidence
  versions. It supports synthetic driver/vehicle/membership decisions and
  same-key retry after a lost response. No upload, assignment, role-delegation,
  permit, fare or operational interface was added.
- Combined HTTP, Playwright and ADB harnesses exercise the actual Nest/Fastify
  application with isolated PostgreSQL/Redis and the local Keycloak instance.
  Mock messages/credentials stay in private IPC/RAM; no public fixture/code route,
  fixed authentication code, provider-token browser store or plaintext secret file
  was introduced. Evidence privacy has six dedicated regression tests.

No public API endpoint or database migration changed in M2.7. Reviewed migrations
0001–0007, the M1 ledger and the approved modular-monolith boundaries are preserved.
Source/configuration changes include the mobile package and tabs, minimal admin
review panel, SDK barrel resolution, CNG Windows build configuration, public
example keys, pnpm scripts/lockfile, CI checks and documentation/evidence.

## Executed validation

Windows runners invoke the installed pnpm CLI through Node when needed to avoid
PowerShell treating ordinary native stderr progress as terminating errors. The
canonical commands and actual exit codes/timestamps are recorded below.

| Command | Observed result |
| --- | --- |
| `pnpm.cmd install --lockfile-only --ignore-scripts`; `pnpm.cmd install --frozen-lockfile --ignore-scripts` | Exit 0; reviewed reproducible lockfile and bounded SDK patch alignment |
| `pnpm.cmd validate` | Final exit 0: contracts, lint, all workspace strict TypeScript checks, 138 tests and API/admin builds |
| `pnpm.cmd test:identity:db` | 11 passed |
| `pnpm.cmd test:authorization:db` | 12 passed |
| `pnpm.cmd test:passenger:auth` | 15 passed |
| `pnpm.cmd test:driver:auth` | 15 passed |
| `pnpm.cmd test:admin:auth` | 15 passed against actual local Keycloak/TOTP |
| `pnpm.cmd test:verification` | 12 passed |
| `pnpm.cmd test:m2:integration` | 8 combined HTTP cases passed; prerequisite client/controller reruns are not added to this count |
| `pnpm.cmd test:m2:browser` | 5 Playwright cases passed; 5 masked screenshots |
| `pnpm.cmd mobile:check`; `pnpm.cmd mobile:doctor` | Both apps passed online checks; Doctor 21/21 each |
| `pnpm.cmd mobile:export` | Both exports passed |
| `pnpm.cmd audit:dependencies` | Final exit 0; no known vulnerabilities reported |
| `node --test tests/android-evidence-privacy.test.mjs` | 6 passed; also included in final validation |
| `node scripts/test-m2-android.mjs` | Final exit 0; BOTH_APPLICATIONS, 30 acceptance checkpoints, 29 captures |

The final 138 tests comprise 9 SDK, 15 mobile-controller, 92 API and 22 repository
cases. Earlier validation had 132; six evidence-privacy regressions account for
the increase. The six database/authentication suites passed all 80 cases after
infrastructure restart and realm repair, including migration/rollback/reapply,
constraints, transactions, concurrency, RLS/scope isolation and preservation.

Evidence: [validation](../evidence/m2/m2-7/validation-results.json),
[final handoff](../evidence/m2/m2-7/handoff-validation-results.json),
[80 regression cases](../evidence/m2/m2-7/backend-regression-results.json),
[combined HTTP](../evidence/m2/m2-7/integration-results.json),
[browser](../evidence/m2/m2-7/browser-results.json),
[audit](../evidence/m2/m2-7/dependency-audit.txt).

The combined HTTP run measured six unique concurrent OTP requests in 247ms and
four same-request concurrent verifications in 198ms, with one authoritative
session. These are local measurements, not production capacity claims.

## Infrastructure and preservation

The following existing services were restarted successfully after the host reboot:

```powershell
docker compose --env-file .env.m2-test -f infra/compose.m2-test.yml up -d --wait
docker compose --env-file .env.local -f infra/compose.m2-keycloak.yml up -d --wait
```

All four M2 containers were observed healthy. Tests use PostgreSQL/PostGIS 15433,
Redis 16380 (`PONG`) and pinned Keycloak 26.8.2 on loopback 18080 (health 19000),
with separate IdP database ownership/credentials. The harness creates only a
manifest-checked `trissea_m2_test_<random>` database and separate non-owner runtime
logins in the dedicated disposable cluster. The unrelated sentinel and seven
migration entries survive. No operational migration, Redis flush, database/volume
removal or M1 port/configuration reset was performed. M1 ports 15432/16379 remain
outside these tests.

An old ignored realm import lacked the final `local-synthetic` marker. Provisioning
correctly rejected it. At repair time, a one-time local check confirmed the exact
realm/issuer, zero end users, development mode and matching saved client secrets.
Only the missing marker was added to the owned realm/import, with an ignored
backup; the normal strict provisioner then passed. No credential, application
permission, MFA/recovery guard or operational database changed. The backup contains
secrets and must remain ignored. Later tests provisioned synthetic realm users.

## Android environment and build evidence

| Component | Actual environment |
| --- | --- |
| Android Studio | `AI-262.10968.63.2622.16730706`, build `262.10968.63.2622.16730706`, read from installed `product-info.json` |
| SDK | `%LOCALAPPDATA%\Android\Sdk`; compile/target API 36, Build Tools 36.0.0 |
| ADB | 1.0.41, platform-tools `37.0.1-15733141` |
| Emulator | 37.2.13.0, build 16740729; API 37 Google Play x86_64 |
| Passenger AVD | `Pixel_10a_Passenger`, `emulator-5554` |
| Driver AVD | `Pixel_10a_Driver`, `emulator-5556` |
| Build tools | Existing Temurin 17.0.20.1 through process-local JAVA_HOME; Gradle 9.3.1; NDK 27.1.12297006; CMake 3.31.6 / Ninja 1.12.1 |

Both x86_64 development APKs built successfully on November 6 with:

```powershell
# Executed in each application's generated android directory
gradlew.bat app:assembleDebug --no-daemon --max-workers=2 --console=plain -PreactNativeArchitectures=x86_64
```

Passenger: exit 0, 10m39s, 455 tasks. Driver: exit 0, 13m1s, 455 tasks.
Actual hashes, byte sizes and ignored artifact paths are in the
[build record](../evidence/m2/m2-7/android-build-results.json). The final native
run reused those compatible APKs; subsequent changes required no native rebuild.
Generated APKs, keystores, build output and caches are excluded from Git.

The native harness installs with `-r`, verifies actual APK/package identifiers
before launching, and uses explicit serials for every device operation. Passenger
is `ph.trissea.passenger.dev` on Metro 8081; driver is `ph.trissea.driver.dev` on
8082. Both reverse the disposable API's 4104 port. Actual Android manifest launch
assets are compiled before the development-client deep link is opened. No location
or SMS permission declarations were found for the tested packages.

Owned emulator processes retain software rendering and add `-feature -Vulkan`,
`-no-window`, `-no-snapshot-load`, `-no-snapshot-save`. Existing AVD data is preserved.
Tests execute sequentially on the 16GB host; original font/night/size/density/stay-on
settings are restored. Owned test emulators, Metro and API processes stop after
acceptance. Existing Docker services and unrelated processes are retained. No
additional Android images or AVDs were created.

## Final native acceptance

The [full native report](../evidence/m2/m2-7/android-results.json) is **PASSED**,
coverage **BOTH_APPLICATIONS**, from 2026-11-08 19:07:38 to 19:40:32 PHT.
All 30 checkpoints passed; the shared final gate confirms distinct identities/
sessions, no captured OTP in Metro/all-level tracked app logs, server-log redaction,
Redis connectivity and preservation. The report includes actual bounds and targets.

Both apps passed invalid/valid OTP, explicit consent, current server profile,
background/cold secure restoration, real network failure/retry, dark mode and
150% fonts, scrolling at 360x640dp and 576x1024dp, native ciphertext inspection,
PostgreSQL session revocation/expiry, offline sign-out and cold recovery. Driver
pending verification keeps Go Online disabled. Successful authentication grants
no driving eligibility, GPS collection or operational service.

Measured native button heights were 65dp and 65.2dp for each app; all expose
`android.widget.Button`. Screens were reopened and server-validated after Android
configuration changes before settled-layout inspection. Representative saved
states were visually inspected for wrapping, controls, errors, scrolling and safe
areas. No TalkBack, physical-device, iOS, biometric or complete manual WCAG
acceptance is claimed. Session expiry uses an owned synthetic database timestamp;
configured JWT/session lifetimes are unchanged. OTP expiry waits the real five-minute
policy without clock/TTL overrides.

The final report records **two guest Android System UI ANRs**, one on each AVD.
A single Wait action was recorded per device; repeated OS dialogs or any TRISSEA
failure still fail the test. All subsequent application assertions passed, with
no selected startup-crash/JS-exception/raw-JWT markers observed in tracked app
processes. This is local acceptance with a documented emulator limitation, not a
claim that the guest OS or production devices are fault-free. Software/Vulkan
workarounds follow [Android guidance](https://developer.android.com/studio/run/emulator-troubleshooting).

Representative actual captures:
[passenger large text](../evidence/m2/m2-7/passenger-small-controls.png),
[expired code](../evidence/m2/m2-7/passenger-expired-code.png),
[driver pending verification](../evidence/m2/m2-7/driver-large-controls.png),
[offline sign-out](../evidence/m2/m2-7/driver-pending-offline-signout.png),
[confirmed sign-out](../evidence/m2/m2-7/driver-signed-out.png).
All 29 native captures and five current browser captures are under
`evidence/m2/m2-7/`; clearly named historical failures are retained separately.

## Browser acceptance

Playwright used real local Keycloak password/TOTP and actual React/Vite/Nest
requests. A synthetic driver authenticated, consented and submitted a case; its
assigned officer reviewed it. A dropped committed decision retried with the
original key produced one decision, one approval audit and one outbox event.
Vehicle/officer and membership/manager authority stayed separate. Foreign-TODA,
support, invalid CSRF, mixed credentials and revoked-grant cases denied access
and cleared retained review data. HttpOnly Strict cookies, empty browser token
stores, keyboard focus, 390px no-overflow layout and zero page exceptions were
observed. Captured inputs are masked. No provider token is in localStorage.

## Defects, corrections and historical evidence

| Finding | Correction / actual outcome |
| --- | --- |
| Private credential fields reached strict SDK request bodies | Project only deviceId/clientProof; actual transport regression and native flows pass |
| Metro could not resolve source `.js` barrel imports | Extensionless public barrel; both exports, native bundles and validation pass |
| Lost browser logout response retained private review UI | Hide immediately; keep the same pending attempt/key for retry; fifth browser regression passes. Browser retry is in memory, not claimed across full browser restarts |
| Java 25/old Ninja failed Windows native builds | Existing JDK 17; worktree/app-isolated staging with SHA prefix and CMake object limit 250; SDK CMake 3.31.6 / Ninja 1.12.1; both real APK builds pass |
| Online Expo checks exposed patch drift (20/21) | Reviewed SDK-57 patch alignment; both online checks/21-of-21 Doctors pass |
| Metro launch preceded readiness | Assert bounded readiness and compile actual Android launch asset first |
| Reverse listener removal left pooled HTTP alive | Private IPC closes only the disposable test server's HTTP clients; outage tests now confirm hidden profile/retry |
| Guest OS/ADB became unresponsive under memory pressure | Sequential software-rendered AVDs, recorded one-time OS Wait, bounded capture/foreground checks; no app or security failure ignored |
| Font/density recreation changed route; immediate capture clipped text | Reopen Account/Profile and validate the session before settled-layout capture; readable 150% views verified. Hot transitions are not manual accessibility acceptance |
| Partially visible action produced clipped bounds | Scroll full action into view; keep strict 48dp and button-class checks; record actual geometry. [UIAutomator uses visible bounds](https://android.googlesource.com/platform/frameworks/base/+/6d498747ce1aa7c3aacbf322e10d6383d50f3f12/cmds/uiautomator/library/core-src/com/android/uiautomator/core/AccessibilityNodeInfoDumper.java) |
| Fast ADB phone injection produced malformed draft | Focus actual EditText, clear, type via stdin with 150ms spacing, verify value before request; OTP must expose password semantics |
| Old evidence filter missed malformed synthetic phone | Removed that private cached image before publication; guard now rejects occupied/masked inputs, malformed/formatted phone and embedded private values; six regressions pass |
| Driver revocation attempt remained on launcher | Wait for stable foreground/background ownership and revalidate after display restoration; final driver revocation/expiry/logout pass |

Historical failures remain failures, not relabeled passes: [OS readiness failure](../evidence/m2/m2-7/android-environment-failure.json),
[initial driver run](../evidence/m2/m2-7/android-driver-initial-results.json),
[pre-foreground-sync run](../evidence/m2/m2-7/android-before-foreground-sync.json),
[launcher capture](../evidence/m2/m2-7/android-driver-launcher-transition.png).
Automatic approval review rejected broad cache cleanup and a standalone preview-enable
command as `blocked by policy`; neither was bypassed. Cleanup became unnecessary.
The accepted preview ran only against its manifest-verified synthetic API.

## Dependency and configuration review

Only SDK-compatible Crypto/SecureStore 57.0.4 were added as native identity modules.
The bounded compatibility update pins Expo 57.0.32, Router 57.0.30, Constants
57.0.23, Dev Client 57.0.21, Metro Runtime 57.0.18, LogBox 57.0.5 and root Config
Plugins 57.0.12. React 19.2.3, React Native 0.86.3 and backend versions are retained.
SDK changelogs/peer metadata were reviewed; no doctor exclusions or weakened
security overrides were introduced. The newer CLI uses JSON Schema for DevTools;
compatibility tests still validate accepted and rejected plugin/output shapes.
The obsolete deepmerge dependency and its earlier low advisory are gone.

Windows staging is isolated under `%USERPROFILE%/.trissea-native/<checkout-hash>/<app>/`.
Only required CMake was installed side by side through the official SDK tool:
`sdkmanager.bat "cmake;3.31.6" --channel=0` (exit 0). Existing SDKs, caches, registry,
global Java and the user's platform-tools backup are preserved. References:
[Expo changelog](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/CHANGELOG.md),
[Router changelog](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-router/CHANGELOG.md),
[Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/),
[SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/),
[CMake paths](https://cmake.org/cmake/help/latest/variable/CMAKE_OBJECT_PATH_MAX.html),
[Ninja Windows paths](https://github.com/ninja-build/ninja/releases/tag/v1.12.0).

`EXPO_PUBLIC_M2_AUTH_ENABLED=false` and an empty `EXPO_PUBLIC_M2_API_URL` are the
tracked defaults. Native development preview accepts only explicitly configured
loopback/emulator `/v1` endpoints on 4100/4101/4104; production/web cannot activate
it. `dev:passenger:identity` and `dev:driver:identity` read only those two public
keys from ignored `.env.local`, allow process injection to win and disable Expo's
extra dotenv loading. Private configuration and M1 environment files are preserved.
The Vite proxy permits loopback 4104 on the existing local callback origin 5174.

## Remaining gates and Git handoff

There is no remaining mandatory local engineering test failure. Physical-device/
iOS and manual screen-reader acceptance remain unrun. Guest OS warnings and
configuration-driven activity/route recreation remain documented limitations;
final product styling is deferred as approved.

Gates A–E remain CLOSED: no live SMS, real identity documents, real operational
driver approval, privileged recovery/delegation or public deployment. Production
rate limits, session/revocation guarantees, spend controls, legal notices,
retention, reviewer/permit authority and operational procedures still require their
separate security/privacy/owner approvals. Synthetic consent/verification never
constitutes legal consent or operating authority. Supabase is not used.

Branch: `test/m2-security-acceptance`; accepted M2.6 HEAD:
`47a57c4314fafe6478802e0553da991be26e93b5`. Remote remains
`https://github.com/angelo-peralta/TRISSEA_Platform.git`. M2.7 changes and reviewed
evidence are uncommitted for owner review; no staging, push, PR, merge or deployment
was performed during the original M2.7 acceptance run. Original dirty checkout
changes and the preexisting untracked
`docs/50-TRISSEA_GIT_AGENT_RULES.md` are preserved. No private env, credential,
APK, cache or raw hierarchy is included in the proposed M2.7 scope.

The final [source review](../evidence/m2/m2-7/source-review-results.json) found no
unexpected env files, generated binaries or known private-key/token patterns in
the reviewed candidate files. This is a scoped check, not a comprehensive security
certification. A separate [actual APK permission review](../evidence/m2/m2-7/android-permission-review.json)
found no location or SMS declarations in either binary. `git diff --check` passed.

Stop here for owner review. No next milestone implementation is authorized.


## Final infrastructure revalidation ? 2026-11-09

[ADR 66](66-ADR-DEVELOPMENT-INFRASTRUCTURE.md) records the actual consolidated
`trissea-dev` stack, preservation, legacy retirement and new final-port results:
156 validation tests, the full 80 database/authentication cases, eight HTTP and
five browser cases, four API startups, both Metro servers and controlled cold
restart passed. Existing Android checkpoints remain historical emulator evidence;
physical/iOS/manual screen-reader checks were not repeated or promoted to passes.
The owner now authorizes the reviewed M2 feature-branch commit/push and draft PR.
Merge, production, operational capabilities and M3 remain prohibited.

## Review fix - assigned queue pagination (2026-11-09)

The administration panel previously discarded `VerificationCases.nextCursor`.
Because completed cases stay in the UUID-ordered queue, reloading its first 20
records could never expose later submissions. Both driver/vehicle and TODA
membership queues now retain the cursor and expose **Load more assigned cases**,
forwarding it as the API's `after` query parameter and appending the returned page.
No backend contract, page limit, assignment rule or migration changed.

The button disappears at the final page and is disabled while a request runs.
Reload starts from the first page. Temporary next-page network/server failures
retain the loaded rows and cursor for retry. Invalid/nonadvancing cursors,
duplicate rows, wrong scope and denied access clear retained review data.
Pagination also clears on queue/TODA changes, hidden-tab cleanup and successful
decisions; existing abort/epoch checks prevent stale responses restoring data.
Every page and decision still requires current server-side authority.

Actual validation against the canonical local stack and fresh manifest-verified
disposable databases:

| Command / check | Observed result |
| --- | --- |
| `pnpm.cmd test:m2:browser` before the fix | Exit 1; 5 passed / 1 failed, at the missing next-page action |
| `pnpm.cmd test:m2:browser` after the fix | Exit 0; all 6 passed |
| `pnpm.cmd validate` | Exit 0; 156 tests, contracts, lint, TypeScript and API/admin builds passed |
| `pnpm.cmd test:m2:integration` | Exit 0; 8 HTTP tests passed |
| `pnpm.cmd lint` on the final browser harness | Exit 0 |
| `pnpm.cmd dev:infra:check` | Healthy four-service `trissea-dev`, PostGIS, Redis PONG, role/DB isolation and no sibling bind dependencies |

The added Playwright regression creates 44 assigned driver/vehicle cases and 43
membership cases through real synthetic intake/submission flows and test-only
private IPC assignment. Both queues span three pages, including already approved
records. It checks each forwarded cursor, exact accumulated counts, unique IDs,
final-page inspection **and approval**, terminal button removal, reload, a
simulated HTTP 503 page failure/retry, simulated HTTP 403 cleanup and queue/TODA/
visibility resets. Existing real Keycloak password/TOTP, current-grant revocation,
CSRF, lost-response retry and browser-storage privacy checks pass in the same run.
HTTP failure injection tests the UI; it does not claim an actual provider outage.

[Execution evidence](../evidence/m2/verification-pagination/validation.json),
[browser results](../evidence/m2/verification-pagination/browser-results.json),
[first page and retry action](../evidence/m2/verification-pagination/driver-queue-first-page.png),
[all 44 driver/vehicle cases](../evidence/m2/verification-pagination/driver-queue-paginated.png),
and [all 43 membership cases at 390px](../evidence/m2/verification-pagination/membership-queue-paginated.png)
record this review fix. Inputs are masked and records are synthetic. This is
desktop/mobile-width Chromium acceptance; no new Android, physical-device or
manual screen-reader pass is claimed. No retained application/IdP database,
credential, environment, dependency or production capability was changed.
