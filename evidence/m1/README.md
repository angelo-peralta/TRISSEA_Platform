# M1 acceptance evidence — 2026-11-05

Actual ADB captures and Android accessibility hierarchies, plus Playwright/Edge
browser captures. No mock screenshots, real user records, GPS data or credentials.
Run the recorded commands from the repository root. The acceptance narrative is
in [docs/49-M1-FOUNDATION.md](../../docs/49-M1-FOUNDATION.md).

## Selected screens

| Check | Passenger | Driver |
| --- | --- | --- |
| Final phone, light | [screen](passenger-final-light.png) | [screen](driver-final-light.png) |
| Final phone, dark | [screen](passenger-final-dark.png) | [screen](driver-final-dark.png) |
| Small phone, 360 dp, normal font | [screen](passenger-360-normal-light.png) | [screen](driver-360-normal-light.png) |
| Large display, 600 dp, 200% font, dark | [screen](passenger-600-large-dark.png) | [screen](driver-600-large-dark.png) |
| Scrolled content at large text | [all remaining services](passenger-600-large-dark-bottom.png) | [disabled online control and no offers](driver-600-large-dark-bottom.png) |
| Cold launcher reopen | [screen](passenger-cold-reopened-2.png) | [screen](driver-cold-reopened-2.png) |

Each Android PNG has a matching `.xml` hierarchy and `.json` label/bounds record.
The floating gear is the Expo development-client tool overlay.

Admin: [desktop](admin-desktop.png), [360 px fare reference](admin-fares-360.png),
[loading](admin-loading.png), [intentional outage](admin-error.png),
[successful real API retry](admin-connected.png).

## Machine-readable results

- [Passenger screen matrix](android-matrix-passenger-results.json) and
  [driver screen matrix](android-matrix-driver-results.json): viewport/font/theme,
  native control bounds, scrolling and preview restrictions.
- [Passenger reopen](passenger-reopen-results.json) and
  [driver reopen](driver-reopen-results.json): normal launcher background/reopen
  and two cold starts each, JavaScript startup and ANR counters.
- [Final navigation](final-navigation-results.json): all seven tabs and both themes.
- [Final paired running state](final-running-state.json): both emulators resumed,
  display overrides restored, separate packages/Metro forwards and four HTTP probes.
- [Admin browser acceptance](admin-results.json): nine navigation sections at
  1440/390/360 px, real proxied health, pending/disabled, HTTP 503 and retry.
- [Final source validation](validate-final.txt): lint, TypeScript, contracts,
  18 tests, API/admin builds. Earlier failed iterations remain local; the
  ColorValue callback type error was corrected before the final pass.
- Submission rechecks: [validation](submission-validation.txt),
  [mobile dependency check](submission-mobile-check.txt),
  [Expo Doctor](submission-mobile-doctor.txt), [audit](submission-audit.txt).
- [Dependency threshold audit](dependency-audit.json) and
  [all-severity audit](dependency-audit-all-severities.json). The moderate policy
  passes; the all-severity command exits 1 for the disclosed low deepmerge finding.
- [ADB command journal](adb-commands.jsonl) records explicit device selectors and
  argument arrays. `m1-*.mjs.txt` files preserve the actual one-off QA harnesses;
  their executed originals remain in ignored `.cache/`.
- [Screenshot dimensions and sampled surfaces](screenshot-metadata.json) confirm
  actual light `#F7F9FA` and dark `#102A43` rendering.

## Defects and limits

Status separators, missing default tab glyphs, large-text tab layout, tab hit areas
and the admin favicon request were corrected. Native bounds are approximately
58 dp high at normal font size, exceeding the 48 dp requirement. Long tab labels
may wrap at maximum text size; scaling is not disabled.

The initial passenger host-GPU run recorded two ANRs. See the
[actual dialog](passenger-anr-dialog.png) and
[reviewed trace excerpts](passenger-anr-summary.txt). One trace was in SoLoader native
library loading; another waited in `DrawFrameTask::drawFrame`. Relaunching the same
AVD with `-gpu software -no-snapshot-load -no-snapshot-save` selected SwiftShader.
Subsequent screen and reopening checks passed with no additional ANR entries.
This is a local emulator workaround, not proof of an upstream GPU-driver fix.
The driver used its existing host renderer and recorded zero ANRs.

The public submission contains selected final captures and reviewed test output.
Raw host diagnostics, working-tree snapshots, intermediate captures and failed
iterations remain local and untracked. The initial capture harness could retain
an outdated hierarchy; the final harness rejects non-app windows and unavailable
dumps, waits for selected tabs and retries transient null accessibility roots.

Accessibility evidence covers labels, selected/disabled state, native hit bounds,
font scaling, inspected screenshots and automated token contrast. Audible
TalkBack traversal, physical-phone/outdoor QA, iOS behavior and native background
GPS are not claimed. This is local M1 preview acceptance, not public-release QA.
