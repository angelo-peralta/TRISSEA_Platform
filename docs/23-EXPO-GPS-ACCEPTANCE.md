# Expo driver background GPS — field acceptance protocol

**Status:** Test plan only. **No tests have been run.** This document is a release gate, not a guarantee of background execution.

## Goal
Determine whether Expo location/task manager and platform foreground services are sufficient for the TRISSEA driver application on representative Android devices and networks.

## Minimum device set
- At least one low-cost Android phone in widespread use locally and one newer Android phone.
- Multiple OEM battery-management configurations; document Android version, app version and permission states.
- One iPhone for iOS viability later, with iOS-specific permission/background policy validation.
- SIM/network coverage tests on local carriers and loss-of-data periods.

## Test matrix and expected safe behavior
| Scenario | Required outcome |
|---|---|
| Foreground driving shift | Location update and accuracy visible; backend receives monotonically sequenced samples |
| Screen locked / app backgrounded | Service behavior measured; persistent Android notification and required permissions visible where applicable |
| User denies background permission | Explain limitation; driver must not appear reliably online if fresh GPS is required |
| GPS disabled | Driver shows GPS unavailable; backend eventually marks driver stale/unavailable |
| Mobile data interrupted | Timestamp and sequence preserved; reconnect reconciles real server state; no fake acceptance |
| Server or socket temporarily down | Exponential retry and bounded data use; queued telemetry is retention-limited and nonauthoritative |
| App swipe-away / force-stop | Record actual OEM behavior; **never assume tracking resumes automatically** |
| Device restart | Driver default offline until a supported, user-authorized session restoration path is proven |
| 30-minute and 2-hour shift | Measure missed samples, battery drain, thermal impact and mobile-data consumption |
| Two concurrent offers | Backend guarantees at most one active reservation; client renders the canonical result |
| Logout, duty-end, restriction | Stop tracking, clear live presence and cancel tasks promptly |

## Recording template
For each run record device model, Android/iOS version, app build, Expo SDK, MapLibre version, carrier, signal conditions, permission state, task/service lifecycle, app foreground/background events, sample arrival timestamps, GPS accuracy, battery start/end, network transfer and any manual intervention.

## Pass/fail rules
- No duplicate assignment or locally-authoritative offer acceptance, ever.
- Fresh location is required before a driver becomes dispatch-eligible; if stale, block new offers until recovered.
- Explicit shift-off stops updates; sensitive GPS data retention and log redaction must pass review.
- Agree numeric GPS/battery/fanout thresholds with the operator before claiming production readiness; provisional figures in `13-TESTING-SLOs.md` are not measured facts.
- Failure on representative Android devices triggers ADR assessment for a native Kotlin service, not concealment of the failure.

## Agent instructions
Do not replace physical device tests with emulator claims. Do not enable broad background location permissions without a documented policy basis. Attach reproducible measurements to the milestone pull request.
