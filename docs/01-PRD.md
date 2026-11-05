> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# Product Requirements Document (PRD)

## Mission
TRISSEA connects passengers and licensed/authorized transport operators through reliable, transparent on-demand and terminal-based dispatch. It targets a localized Philippine deployment with support for low-bandwidth mobile access, cash payments and approved vehicle/service categories.

## Actors and access
| Role | Core capabilities | Restriction |
| --- | --- | --- |
| Passenger | register, set pickup/drop-off, quote, book, track, cancel, complete, review | cannot choose an unoffered driver or bypass fare rules |
| Driver | identity verification, approved vehicle, online/offline, join queue, accept offers, location updates, ride handling | cannot self-verify or assign trips |
| Dispatcher | supervise tenant queues, limited manual interventions with reasons | cannot operate across tenants |
| Tenant admin | fares within policy, terminals, zones, staff, reporting | cannot approve own tenant licensing outside platform gate |
| Superadmin | tenant onboarding, policy, audit and incident response | audited privileged access |

## Official ride options
- **Regular (`REGULAR`):** quick private pickup→destination booking.
- **Shared (`SHARED`):** lower-fare pooled seat booking, requiring verified seat allocation and multi-passenger manifest.
- **Special (`SPECIAL`):** exclusive whole-unit itinerary with optional multiple stops or round trip.
- **Reservation (`RESERVATION`):** passenger reservation for a future pickup window at an approved TODA terminal; a distinct resource, not a driver queue slot or assigned ride (ADR-008).
See `docs/25-RIDE-OPTIONS.md` for authoritative behavior and release sequencing.

## MVP capabilities
### Passenger
Phone-based sign-in; map and pickup correction; route and vehicle selection; price quote with expiry; request and cancel; ride status; driver/vehicle information after matching; safe contact flow; cash completion and receipt; safety/report action.
### Driver
Onboarding and approval state; go online; select on-demand or terminal shift; geofence-backed queue check-in; position and eligibility; timed ride offer; arrival/pickup/trip status; earnings ledger; connection recovery.
### Operations
Tenant management; driver verification; routes, vehicles, terminals and service zones; queue state and override audit; booking monitoring; support incidents; pricing configuration; shift and ride analytics.
### Platform
Server-enforced tenancy; permissions; event log; idempotency; fraudulent location checks; rate limits; backups; retention controls; observability.

## Phased delivery scope
**MVP v1:** Regular private rides plus validated TODA queue mechanics; Reservation holder is confirmed as the passenger; enabling it still requires LGU/TODA-approved slot, fare, capacity and operational policy. **MVP v2:** Special whole-unit stops/round trips. **MVP v3:** Shared pooling after capacity, itinerary, driver-engagement and passenger lifecycle concurrency tests pass. These are all planned TRISSEA ride options but not all initial-MVP functionality.

Deferred beyond the ride-option milestones: surge pricing, loyalty/subscriptions, advanced incentives, automated settlement, predictive demand, automated document OCR, large contact center, multi-region active-active.

## Service model and assumptions
- Start with a small licensed pilot and initially enable only validated services; do not assume Regular, Shared, Special or Reservation (or different vehicle classes) share regulatory treatment.
- A terminal may enforce FIFO and route/seat capacity; Shared is disabled until passenger pooling and route-segment occupancy are implemented and authorized.
- The system may suggest an alternate terminal or on-demand booking, but fare/service change requires passenger reconfirmation.
- Pricing is a tenant-owned, versioned server calculation; UI never defines the final fare.

## Quality requirements
- All financial amounts are integer centavos, PHP; display `₱` and correct separators.
- No duplicate active ride for a passenger; no duplicate active assignment for a driver.
- An accepted ride is durable and replayable after mobile reconnect.
- Explicit empty/error/offline states in Tagalog/English-ready copy.
- Support low-end Android testing, daylight readability and touch-friendly controls.
- Secure audit trail for all administrative overrides and high-risk actions.

## KPIs (baseline targets to validate during pilot)
Request success %, dispatch match %, offer acceptance %, median time-to-match, cancellation rate by actor/reason, arrival-time prediction error, GPS freshness %, queue fairness divergence, failed payment/settlement %, customer support contacts per 100 trips.

## MVP acceptance journey
Passenger requests → server validates and persists → dispatch selects eligible driver → offer is delivered/recoverable → driver accepts once → passenger sees assignment → driver arrives → passenger is picked up → trip completes → receipt and auditable ledger entry exist; failures are safe and retriable.
