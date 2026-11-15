# M4 — Local Regular ride simulation

Implementation branch: `feat/m4-regular-ride-booking`. Engineering simulation only;
LGU approval, operational authority and production acceptance are not implied.

## State and persistence

Migration `0010_regular_simulation` adds the `simulation` schema in the existing
application database. Earlier migrations are unchanged. PostgreSQL owns enrolled
synthetic participants, scenarios, expiring quotes, rides, individual offers,
versioned transition history, immutable receipts, cash simulation events and
encrypted idempotency responses. Drizzle supplies the API persistence mapping.

The implemented path is quote preview → REQUESTED → SEARCHING → OFFERED →
DRIVER_ASSIGNED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED.
Cancellation is allowed before the trip starts. Expired or declined offers try
the next ranked fixture; exhausted candidates/search time produce
NO_DRIVER_AVAILABLE. Individual offers and cash status have separate lifecycles.
EXPIRED/FAILED are reserved terminal ride states; clients cannot set arbitrary
states. Quote preview is a quote record, not an active driver engagement.

Scope advisory locks, ride row locks, expected versions and partial unique
indexes enforce one active ride per passenger/driver and one winning offer.
Every ride/offer/receipt/cash mutation writes sanitized audit and outbox records
in the same transaction. Failure rolls back the transition. Offers remain durable
across API restarts; the bounded scheduler resumes expired work from PostgreSQL.
No production ranking or new queue service is introduced.

Runtime connections use a non-owner role, FORCE RLS and narrowly exposed guarded
functions owned by a separate NOLOGIN role. The runtime cannot assume that role
or directly update rides, offers or receipts. Declined/expired candidates lose
ride visibility. Historical assigned-driver and passenger access remains scoped.

## Fare and pickup integrity

The service calls M3 `calculateFare`; M4 contains no separate fare calculator or
hardcoded pricing rates. Owner-provisioned scenarios select immutable M3 policy
versions, exact matrix destinations where applicable and explicit synthetic road
distance/capacity. M3 family locks serialize policy changes with confirmation.
Changed policy lifecycle/revision or scenario version and expired quotes require
a new preview. The confirmed quote is immutable and never repriced.

With the initial M3 proposal, the 5 km off-Plaza fixture has a PHP 26 reference;
one passenger and example capacity five at 15% compensation totals PHP 41.60.
These are synthetic proposals, never payable charges. Unsupported discounts
return unavailable. Matrix discounts remain exact; no discount assumptions are
added by M4. No driver earnings or settlement is inferred from passenger prices.

Pickup uses a random synthetic six-digit challenge: keyed digest for comparison,
authenticated encryption for passenger recovery, five persisted guesses, assigned
driver/state/version checks and idempotent attempts. Secrets and entire retry
responses are encrypted at rest. This is not field-tested pickup verification.
Completion creates one immutable cash-simulation receipt. A separate event can
mark collection simulated; physically received and settled remain false.

## Mobile and recovery

Both existing Expo applications use the shared token-based components and their
existing purpose-bound M2 authentication. Home provides synthetic route and count
selection, fare confirmation, search/cancellation, offers, assigned driver,
pickup/trip progression, receipt and recent ride recovery. Account/Profile screens
and purpose-bound identity contracts are preserved. No location permission, GPS
collection, real map routing or new UI
framework is added.

The typed generated client covers the simulation-only JSON routes documented in
`contracts/openapi-mvp.yaml`. `/simulation/events` sends authenticated SSE hints;
each event rechecks current session/enrollment. There was no installed Socket.IO
implementation to reuse. Notifications cause authoritative GET synchronization;
three-second polling supplies fallback, foreground/reconnect recovery and version
ordering. Pending mutations are journaled in OS-protected storage before sending,
bound to the signed-in user and retried with the original idempotency key.
No access/refresh tokens are stored in ride state. Storage failure blocks an
untracked mutation. Restart recovery reads PostgreSQL through authenticated GETs.

## Running locally

Use the preserved `trissea-dev` stack (`pnpm.cmd dev:infra:up`).
`pnpm.cmd test:m4:integration` creates manifest-verified disposable fixtures.
`pnpm.cmd test:m4:android` uses the configured Passenger/Driver AVDs on emulator
ports 5554/5556, starting an absent AVD without wiping its data. It verifies the
installed APK against the existing development artifact and uses `adb install -r`
when they differ. It starts
private mock-OTP fixtures and Metro on 8081/8082, reverses local API port 4104,
enrolls only those synthetic sessions and drives the two apps without an APK
rebuild. Codes remain in RAM/ADB stdin; privacy-checked screenshots and sanitized
results belong under ignored `.cache/m4/android/`.
The harness temporarily uses the existing M2 360×640 dp small-screen baseline,
then restores each emulator's original overrides. Newly started AVDs use the host
OpenGL renderer. It stops only AVDs it started. Native navigation readiness,
stable visible controls and Android ANR/rendering failures are checked explicitly.

On a memory-constrained host, install the already-built driver development APK on
`Pixel_10a_Passenger`, stop the test-owned second AVD and run
`node scripts/test-m4-android.mjs --single-device` after API compilation. This
exercises both distinct applications/accounts on one AVD, switching apps and
recovering authoritative snapshots; it is not simultaneous two-device acceptance.

`pnpm.cmd dev:m4:simulation` runs that scenario and retains the synthetic API/apps
for further local use until Ctrl+C. No permanent dotenv file or credentials are
created. Do not point it at core/IdP or production data. Disposable fixture history
is preserved after shutdown, like the existing M2/M3 test workflow.

## Validation record — 15 November 2026

| Check | Observed result |
| --- | --- |
| `pnpm.cmd validate` | Passed: contract parity, lint, workspace types, unit/client/config tests, API/admin builds |
| `pnpm.cmd test:m4:integration` | 11 groups passed: lifecycle, distinct-driver race, scope-bound idempotency, scope/session denial, audit rollback, expiry/staleness, SSE revocation, migration rollback/reapply |
| `pnpm.cmd test:mobile:session` | 29 passed including response-loss/restart, terminal reconciliation, stale versions, secure journal failures, overlapping refreshes, persistent action errors, late-read/home races, request deadlines and purpose-bound session expiry |
| `pnpm.cmd test:client` | 13 passed, including simulation purpose/unsafe-response validation |
| `pnpm.cmd test:m3:integration` | 8 passed, including actual Chromium fare management and pagination regression |
| M2 passenger/driver auth and authorization DB | 15 / 15 / 12 passed against disposable PostgreSQL/Redis |
| `pnpm.cmd environment:check` | Passed; canonical profiles and isolation retained |
| `pnpm.cmd audit:dependencies` | Passed; no known vulnerabilities |
| Native harness/dependency regressions | 14 passed: privacy, viewport/action selection, clipped-control recovery, Java/native crash scoping and dependency compatibility/patch integrity |
| Passenger/driver Expo compatibility checks | Failed: registry expects newer patch versions for Expo, Router, Constants and Linking; existing pins/lockfile retained |
| `pnpm.cmd test:m4:android --debug-on-failure` | Passed, exit 0: simultaneous configured Passenger/Driver AVDs, full lifecycle/receipt, wrong-driver denial, cancellation, no driver, actual offer expiration, offline/reconnect, both-app cold restart, unavailable route, stale quote/new preview, operational denials; zero native crash records |

After scope/recovery fixes, the full `validate` suite passed again on the staged
application candidate. Affected integration, contract and mobile checks also
passed. The API unit suite
has 103 passing tests. The M3 migration regression explicitly targets 0009 so its down/reapply test
continues to test M3 after 0010 exists; no migration or security assertion was
weakened.

Driver-first diagnosis found `Cannot find native module 'ExpoCrypto'` before
Profile could render. The installed driver APK SHA-256 was
`a7ae75930ba48c65227e5a204b3259a006e911127941a1016d2aba0c48d206fc`,
matching the archived M1 binary without Crypto/SecureStore. The local accepted M2
artifact was `ab93c0c9f6040f1a611f1f3b5d2bd503ab463317a35f610d041188a307ace8c4`.
Installing that existing artifact with `-r` restored Profile, mock OTP, consent
and synthetic enrollment without a rebuild or dependency changes. Hashing only
the local build output had missed the installed-binary mismatch.

Separate evidence showed a System UI ANR under software rendering and a cold
native initialization taking 171 seconds on the constrained host. The harness now
waits for registered navigation within a bounded four-minute deadline and rejects
ANRs/app errors. Its tap visibility accounts for the inner application viewport
inside the Expo wrapper. A native acceptance request arrived 39 seconds after its
tap, after offer expiry. A focused client regression reproduced 20 overlapping
snapshot requests from realtime/polling hints; synchronization now shares one
in-flight request sequence and avoids queuing reads during a mutation. The
regression and existing purpose-bound session/recovery tests pass.

A subsequent driver cold restart recorded `SIGSEGV / SEGV_ACCERR` on `mqt_v_js`,
with `MountingCoordinator::pullTransaction` above non-executable heap memory.
Installed `react-native-screens` 4.26.2 contained the listener race addressed by
[upstream PR 4413](https://github.com/software-mansion/react-native-screens/pull/4413).
The four-file fix is backported through
`patches/react-native-screens@4.26.2.patch`; upstream `cpp/legacy` paths map to
`cpp` in this pinned version. Expo, Router, React Native and Screens versions are
unchanged. Both x86_64 APKs rebuilt once, with exit 0, using the existing Temurin
17/CMake 3.31.6 toolchain. Earlier APKs remain in ignored local backup storage.
New hashes/build results are in `.cache/m4/native-build-results.json`.

The harness now audits the native crash buffer by package and test-start epoch,
and detects an exited startup process. Java/ActivityManager error logs alone had
missed this native tombstone. Ten privacy/visibility/crash tests and four dependency
compatibility/integrity tests pass. Checkpoints retain completed native checks across
terminal interruption; the diagnostic stop handler releases its stdin listener.
Background polling also preserves action errors until explicit retry/refresh or
network recovery; the native unavailable-route error was previously overwritten
by a successful background synchronization. A view epoch discards reads started
before a later home/account transition, preventing an expired ride from reopening
after returning home. Native action selectors require button/checkbox semantics,
so a repeated route label inside fare text cannot be tapped as a route selector.
Clipped controls receive a short directed scroll before the broad viewport search;
the regression uses the actual stale-quote selector bounds. The optional
`--quote-only` harness mode diagnoses unavailable/stale previews on both AVDs and
reports a distinct partial result, never full acceptance.

Feature calls have a ten-second network deadline and retain pending idempotency
records on uncertain outcomes. M2 protected calls now publish expired-session or
secure-storage failures instead of leaving the application apparently authenticated.
The existing refresh retry window and purpose restrictions are unchanged. The
native network-only case restores both sessions before disconnecting; separate
passenger/driver regressions prove expiry does not replay uncertain credentials.

On 15 November the final code candidate passed `validate`, environment checks and
the dependency audit. The focused two-device quote diagnostic also exited 0 with
unavailable-route rejection, stale-confirmation rejection, a fresh preview before
confirmation, operational denials and zero native crash-buffer records. This
partial mode is recorded separately in
`.cache/m4/android/quote-scenarios-passed.json`. The earlier backend/database,
M2 security and M3 integration evidence remains applicable: those server paths and
migrations were preserved during native debugging and were not needlessly rerun.

`.cache/m4/android/root-cause.json` holds sanitized diagnosis and
`.cache/m4/android/results.json` records the completed native run on 15 November,
14:23–14:49 PHT. `Pixel_10a_Passenger` (5554) and `Pixel_10a_Driver` (5556) ran
together with the patched APKs. All 17 checkpoints passed and both final crash
audits were zero. This is two-device engineering simulation acceptance, not
physical-device, legal or production acceptance.

A read-only check of that exact manifest-verified fixture database found six
terminal rides: one completed, three cancelled and two no-driver outcomes. It
found one immutable receipt for 4,160 centavos, a separate simulated collection
event, no duplicate winning offers and no active ride. Physically received and
settled remain false. The sanitized result is
`.cache/m4/android/database-oracle.json`; three privacy-checked PNGs record fare
preview, incoming driver offer and completed receipt in the same directory.

The constrained API 37 AVDs reported 3,912 MiB guest RAM each despite a 2,048 MiB
startup request. Host rendering and single-worker Metro were retained. Original
viewport/stay-awake settings were restored and only test-started emulators were
stopped. Existing Docker containers were restarted without recreation; databases,
volumes, credentials and sibling worktrees were preserved. The optional retained
interactive demo mode was not separately exercised.

## Closed gates and delivery

`M4_SIMULATION_ENABLED` defaults false. Enabling it also requires development/test
mode, local-synthetic M2 passenger/driver identity, the same loopback disposable
database, two matching manifests and a restricted runtime role. Production is
rejected in canonical configuration and runtime validation. Explicit participant
enrollment is required. M2 `/driver/shifts`, `/driver/locations`, operational
`/driver/offers` and public booking remain denied even with simulation fixtures.

LGU fare/effective-version approval, exclusive-hire/discount rules, real capacity,
driver/TODA/MTOP authority, legal routing, physical-device GPS trials, privacy and
production readiness remain open. Shared, Special and Reservation are outside M4.
Commit, push and draft PR require explicit M4 publication authorization. No merge
or deployment is authorized.
