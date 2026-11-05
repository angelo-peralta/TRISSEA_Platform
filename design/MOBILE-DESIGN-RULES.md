# TRISSEA Mobile Design Rules — v1.4

**Applies to:** `apps/passenger/**` and `apps/driver/**` (React Native + Expo + TypeScript).

**Authority:** Project-specific product requirements and `AGENTS.md` outrank external AI skills, sample screens, trends and taste. The source of provisional brand tokens is `design/tokens.json`; do not reinvent colors per screen. These are design specifications, not a functioning UI package.

## Design direction

**Personality:** dependable local mobility, calm navigation, high readability, unobtrusive safety cues. **Not:** Grab lookalike, generic SaaS cards, dashboard-heavy screens, neon gradients, oversaturated maps, floating controls covering trip actions, cartoon vehicles, or fabricated ETA data.

Prioritize outdoor visibility, inexpensive Android devices, uncertain mobile signal, quick one-handed interaction, short trips, and multilingual-ready copy for the Philippine market. Provide native iOS behavior too; do not simply port Android navigation blindly.

## Visual language and tokens

- Use `design/tokens.json`: midnight/navy `#102A43`, teal `#087F72`, warm amber `#D99B32`, surfaces `#F7F9FA` and white. These are **provisional** until a design-brand ADR; check each final foreground/background contrast pair.
- Define semantic roles (`primaryAction`, `surface`, `surfaceRaised`, `textPrimary`, `textSecondary`, `border`, `positive`, `warning`, `danger`) and platform-aware light/dark variants. Do **not** treat brand hue alone as success, danger or ride status.
- Base spacing on 4-point increments; use 8/12/16/24/32 for common elements; use stable corner radii and restrained shadow/elevation. Do not hardcode inconsistent dimensions in feature screens.
- Use platform system fonts unless the brand explicitly approves/licences another. Make weight/size hierarchy clear: one screen title, clear section label, readable body, subdued secondary copy, large digit-oriented fares and time windows.
- Icons must have meaning and consistent stroke. Do not depend on icon/color without a label to explain service or status.
- Use one primary action per interaction context. Primary/secondary/destructive actions must remain visually distinct.

## Mobile interaction baseline

- Native touch areas at least **48 dp on Android** and **44 pt on iOS** unless a supported platform control provides equivalent accessible hit slop. Space adjacent destructive actions apart. Ensure reachability at the bottom without obstructing system gesture areas.
- Respect safe areas, status/navigation bars, notches, Dynamic Island, and Android edge-to-edge behavior. Do not use arbitrary absolute top offsets; adjust keyboard insets and sheet height.
- Support font scaling and screen readers. Do not disable scaling to rescue a brittle layout. Truncated fare, plate, pickup landmark, status or button label is a release blocker.
- Minimum WCAG AA contrast target: **4.5:1** for normal text and **3:1** for large text and meaningful UI indicators; verify the *actual composited pair* and disabled-state semantics. Link to an automated contrast check in the PR.
- Apply appropriate accessibility labels, roles, hints, reading order and polite live updates; do not announce every GPS coordinate or map movement.
- Honor reduced motion, avoid mandatory swipe-only gestures, and provide visible button alternatives to drag, swipe, QR, and map-only operations.
- Distinguish pressed, focused, selected, disabled, pending, invalid, and loading states. Never show a completed/confirmed state until server confirmation.

## Information architecture

**Passenger app**
- Clear trip entry: pickup → destination → Regular / Shared / Special / Reservation → fare or slot terms → confirm.
- Regular: show current pickup, destination, estimated fare/conditions, vehicle category and one request action.
- Shared: explicitly mark shared capacity, multiple passenger parties, potential stops/detours, fare boundaries and seat count; no implication of instant private pickup.
- Special: exclusive vehicle; ordered waypoints, round-trip toggle, route estimate, waiting/time charges, edit itinerary before fare consent.
- Reservation: passenger selects approved TODA terminal and a **future pickup window**, confirms slot hold, gets reference/check-in instructions, checks in with credential or dispatcher, consents to current fare, and only then waits for eligible FIFO driver dispatch. The reservation NEVER grants a driver queue position or guaranteed driver.
- Active ride: the *status, driver/plate verification, safety and cancellation/support* must remain readable without interacting with the map.

**Driver app**
- Home displays online/offline, eligibility, current dispatch mode, location freshness and whether enrolled in an approved terminal queue.
- Terminal queue screen clearly shows *current server-acknowledged queue position*, status and terminal, subject to refresh. Never compute authoritative rank locally.
- Incoming offer has pickup landmark, relevant destination/route info when authorized, earnings/fare per approved policy, accept/decline and **server-defined expiry**; never fabricate a countdown.
- Restriction and safety alerts are immediately visible; do not show an enabled Accept button when unavailable/restricted.
- Driver does not reserve future queue slots as a product feature (ADR-008).

## Map-first composition (not map-only)

- MapLibre map presents context, not the exclusive means to complete a trip. Pickup/destination must be searchable/listable with textual street/landmark details and correction controls.
- Provide a **stable bottom sheet** above the gesture area for actions, with readable contrast; its collapsed state must keep the next action and critical status visible.
- Ensure pin layers, routes and current driver marker do not visually imply GPS precision above the reported accuracy. Show stale-location indicator with relative timestamp when data is old.
- No floating controls under notches or system bars, no hidden fare behind a map, no map gesture required for basic trip booking.
- Preserve an actionable skeleton/offline fallback if tiles or routing fail; never report an unsupported route or fake fare as final.
- Explicitly distinguish `estimated` pickup times, confirmed reservation windows (PHT), and live location updates.

## Connection resilience and trust

- A request remains **pending** while the network is uncertain; the app must query its canonical server state when reconnected.
- Show a compact connectivity banner, retry control and last-known update timestamp without revealing precise GPS unnecessarily.
- Prevent double submits by disabling the action while pending and sending an idempotency key. Retry the same key; never duplicate rides.
- If a price/route/terminal changes, show a review sheet and request passenger consent; never auto-switch modes.
- Clearly distinguish `No drivers available`, `Network problem`, `Location unavailable`, `Slot full`, `Permission required`, and `Service area unavailable`.
- Prepare English copy first, provide localization-ready keys, PHT formatting with explicit date/window, Philippine peso formatting (PHP/₱) and regionally meaningful pickup landmarks.

## Motion and performance

- Animate only to reinforce location, state transition, and navigation continuity. Subtle and interruptible animations; no blocking spinners that prevent cancellation/support.
- Keep location updates, map layer effects, and large-list renders off unnecessary React component re-renders. Use virtualized lists for terminal/ride history, efficient icons, and stable reference objects.
- Test on representative low/mid-range Android devices, bright outdoor conditions, low bandwidth, one-handed use, large text, disabled location permission, and battery saver.
- Never claim background tracking reliability solely from a simulator; follow `docs/23-EXPO-GPS-ACCEPTANCE.md`.

## Required states for each transactional screen

Provide designs for: **initial/loading, normal, pending, success, empty, error, offline, permission denied, stale, cancelled/expired, restricted (when relevant)**. Explicitly define user action and expected backend transition for each. A screenshot of the happy path is not a completed screen specification.

## PR design acceptance

Every new screen PR must link to `design/MOBILE-SCREEN-ACCEPTANCE.md` and include: a screenshot of typical Android state, large-font state, at least one failure/offline state, contrast notes, screen-reader names, localization readiness, and a note on server truth (fare, driver assignment, quota, ETA). The reviewer signs off with `design/MOBILE-REVIEW-CHECKLIST.md`.

## Companion sources, not overriding policy

See `design/MOBILE-AGENT-REPOS.md` for verified repositories, install commands, license notes and precedence. Refer to current Expo docs before applying version-sensitive native guidance.
