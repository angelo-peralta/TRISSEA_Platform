> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# TRISSEA Mobile Screen Acceptance Matrix

All screens must use the project Mobile Design Rules, Design Bible and technical docs. Screen names are **proposed Expo Router route identifiers**, not implemented route files.

| Application / Screen | Information hierarchy | Must handle | Release-critical acceptance |
|---|---|---|---|
| Passenger home | Current pickup, search/destination, four service choices | No permission, low data, no service area | Location editable; option descriptions legible at large text |
| Regular request | Map context, pickup/drop-off, quoted fare, request | Quote expiry, network pending, no driver | No confirmation until server ride exists; idempotent request |
| Shared selection | Seat count, expected detours, cost and rules | No seats, route mismatch, long ETA | No false guarantee of exact pickup or private vehicle |
| Special itinerary | Start, ordered stops, round-trip toggle, quote | Invalid stops, price revision, route failure | Itinerary and full-unit terms shown before consent |
| Reservation terminal | Terminal title, landmark, service zone and hours | Closed, inaccessible, no route | Passenger knows terminal pickup is required |
| Reservation slots | PHT window, availability, terms | Expired/full, network reconnection | Availability not equated to confirmed hold |
| Reservation confirmation | Hold expiry, reference, check-in instructions | Expired hold, duplicate booking, cancellation | "No driver assigned" plainly stated |
| Reservation check-in | Window, credential/staff assist, location hint | QR failure, late arrival, offline | No GPS-only check-in; backend verification required |
| Reservation fare consent | Current route/fare, quote expiry | Changed fare/route, no driver | Linked ride only after fare consent and validated check-in |
| Searching/offer pending | Search status, safe exit/cancel, helpful detail | Reconnect, delayed offer, timeout | Show canonical server status on reconnect |
| Driver assigned | Vehicle/plate, pickup point, estimated arrival, safety | Stale GPS, driver cancellation | Verify driver identity and visible location freshness |
| Trip in progress | Route summary, status, safety and help | No map tiles, poor GPS | Safety/help accessible with map hidden |
| Ride complete | Receipt, quote vs final, feedback | Payment pending, reconciling | Distinguish posted final from pending settlement |
| Driver home | Online mode, authorized zones, GPS freshness, restrictions | Permission denied, restricted, offline | Cannot go online without backend eligibility |
| Driver queue | Terminal, server queue rank, join/leave | Duplicate join, position changed, stale | Rank is server-provided; queue policy visible |
| Driver offer | Vehicle-compatible job details, expiry, accept/decline | Expired, already accepted, bad signal | Only backend acceptance confirms booking |
| Driver navigation | Pickup/destination/landmark, progress, safety | GPS drift, route unavailable | Clear fallback and no unsupported route ETA |

## Minimum capture set per screen review

1. Normal state on an Android phone around 360–393 dp wide.
2. Maximum supported text-scale / accessibility state (at least practical large text).
3. No network or stale-state mock (and the actual navigation out of that state).
4. 1 failing field / empty state where appropriate.
5. Screen-reader labels/focus order and touch target audit.
6. Correct PHP, PHT date/time, route/terminal wording and backend-authoritative status.
7. Signed-off real-device smoke test before declaring release-ready; screenshots alone are insufficient.
