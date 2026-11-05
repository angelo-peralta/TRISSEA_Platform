# Fare Engine, Admin Adjustment and Publication Workflow

## Core pricing rule
A map route distance is NOT automatically a tricycle fare. Quote engine selects an authorized **fare policy version** by `(city, TODA/service zone, product type, pickup location, destination/allowed route, passenger discount eligibility, timestamp)`. Reject with `FARE_RULE_NOT_AVAILABLE` if the inputs cannot be legally priced. Rate lines are integer centavos, no floating point math.

For fare schedule entries, store matrix source, directionality, zone/landmark identifiers and class. The printed amount is per-passenger **only if the signed approval confirms it**. For Regular/Special exclusive use, use a separately authorized full-unit fare rule; the app must not simply use the ₱22 per-seat amount as private vehicle price.

### Off-terminal TODA pickup (pending city/TODA confirmation)
- `pickupKind=TERMINAL`: shared-seat passenger checks in at an authorized terminal to board; one booked seat or seat quantity per accepted shared booking.
- `pickupKind=REQUEST_DRIVER_TO_ADDRESS`: if an authorized TODA permits pickup at passenger's location, require whole-vehicle pricing based on **verified legal passenger seat capacity** and **approved per-seat rate** or an independently approved full-hire amount. Quote explicitly says `Private pickup / full-vehicle fare` and shows its approved basis.
- Restrict pickup permission by TODA service zone/MTOP, road edge, terminal policy and driver eligibility. Do not book `Shared` as off-terminal whole-unit while still promising shared seat pricing.
- No unapproved platform convenience fee, surge, arbitrarily selected seat count, or hidden markup.

### Example (illustrative ONLY; not approved)
If an approved fare were ₱22 per passenger for a specific route and a registered tricycle had 3 passenger seats, an authorized `seat_count × fare` private pickup rule would yield ₱66. **Do not activate this rule without written LGU/TODA approval**, route validation and actual verified vehicle capacity. Values shown are illustration, not a tariff.

## Admin screens
1. Fare policy list: product, TODA/zone, origin, destination, current rate, status, effective from/to, source ordinance, last editor, approval.
2. Bulk matrix import: CSV preview + source screenshot + source document; duplicate/unknown-location validation.
3. Editor form: per-seat amount and full-hire/stop/wait policy where authorized; change reason and effective date mandatory. Two column side-by-side before/after.
4. Review queue for independent fare approver: diff, source evidence and safety impact; reject/revise/approve; no self-approval.
5. Effective date scheduler: atomic activation at approved time; expire prior version; default timezone Asia/Manila, UTC persisted.
6. Fare history and audit: who edited and approved, source, affected routes, quoted fare snapshot and reversals/corrections.
7. Feature toggles: enable only authorized option+TODA+geography after required documents attached. Publishing cannot bypass legal gate with superadmin privileges.

## Permission and workflow
`CITY_FARE_EDITOR` → draft `DRAFT_UNVERIFIED` → request review `UNDER_REVIEW` → **different** `CITY_FARE_APPROVER` reviews evidence → `APPROVED_SCHEDULED` → worker activates `ACTIVE` when effective → prior becomes `SUPERSEDED`. Only `CITY_FARE_APPROVER` may approve, and cannot approve own edits. Require MFA freshness/reason; audit every state. Emulate DB transaction locking around overlapping active policies.

## Database contract
Tables: `fare_sources`, `fare_policies_v2`, `fare_rules_v2`, `fare_change_requests`, `fare_approvals`, `quote_fare_snapshots`; exact schema in `database/005_tuguegarao_pilot_REFERENCE.sql`. For each quote: policy id/version, line id(s), source id, discount basis, seats charged, service class, breakdown, totals; quote expiry and specific rider consent.

## Critical tests
- Changing active rates does not rewrite accepted quotes/ride receipts.
- Two reviewers racing to approve overlapping effective policies → at most one active by scoped transaction/advisory lock.
- Maker cannot approve own changes; disabled/expires policy cannot price ride.
- Rate quoted for one direction cannot be automatically used for reverse direction.
- Poblacion fares cannot be used for unknown outside-poblacion route.
- Driver's documented seating capacity changed → new quote/version; existing consent unchanged unless repricing and approval.
- Discounts follow approved matrix line, not automatically fixed percentage; no unchecked student/senior/PWD flag fraud.
