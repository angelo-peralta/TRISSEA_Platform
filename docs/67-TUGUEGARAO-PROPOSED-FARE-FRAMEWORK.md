# TRISSEA — Proposed Distance-Based and Private-Hire Fare Framework for Tuguegarao City

Prepared for future LGU/TRU review, 10 November 2026. **Proposal for local simulation only; not approved, effective or payable.** No ordinance amendment, signature or operating authority is represented by this document.

## Reference and existing fare distribution

The foundation is the [owner-supplied LGU matrix](../data/fare-matrix/tuguegarao-fare-matrix-user-supplied.csv), transcribed from the two source images identified in [the provenance record](35-Fare-Matrix-Provenance.md). The owner confirms Plaza as the origin, one-way journeys and per-passenger amounts, including the printed student/senior/PWD amounts. This confirmation supplements the original CSV; its labels, source-page references, status and origin fields are preserved unchanged. Reverse-direction applicability is unconfirmed.

The 42 listed destination fares total PHP 1,007. Their unweighted regular mean is **PHP 23.976190… (PHP 23.98 for presentation)**, median PHP 23, range PHP 22–33. The discounted mean is PHP 19.785714… (PHP 19.79 for presentation). These averages describe destination rows, not passenger demand or revenue.

| Regular fare, PHP | Listed destinations |
| --- | ---: |
| 22 | 13 |
| 23 | 9 |
| 24 | 6 |
| 25 | 7 |
| 26 | 3 |
| 27 | 2 |
| 30 | 1 |
| 33 | 1 |

The separate within-Poblacion fare is PHP 22 regular / PHP 18 discounted. Including that row gives 43 entries with a regular mean PHP 23.930232… and discounted mean PHP 19.744186…. Calibration uses the 42 listed destinations and reports the Poblacion row separately.

The applicable signed ordinance/matrix, tariff version and effective dates have not yet been established. Their absence does not block local engineering; it blocks real activation.

## Proposed off-Plaza calculation

Development parameters are PHP 22 base fare including 3 km of road travel, PHP 2 per additional km, billed in 0.5 km increments. Additional distance is rounded upward before applying the rate:

```
extra_metres = ceil(max(0, road_metres - 3000) / 500) * 500
reference_centavos = 2200 + round(extra_metres * 200 / 1000)
```

Money is integer centavos. The default final monetary rounding is nearest centavo, half up; an explicit round-up alternative can be compared in draft policies. The default hard maximum is disabled. PHP 100 is a review threshold, not an approved cap or an automatic charge authorization. An administrator may propose a maximum in a new version; that version remains a simulation.

Only measured road-route distance with a permitted-route reference may support future operational consideration. A straight-line GPS measurement cannot substitute for a road route. All example distances below are **synthetic**, not surveyed Plaza-to-destination measurements.

| Illustrative road distance | Extra billed distance | Passenger reference fare |
| --- | ---: | ---: |
| Short: 3 km | 0 km | PHP 22 |
| Boundary: 3.001 km | 0.5 km | PHP 23 |
| Medium: 5 km | 2 km | PHP 26 |
| Long: 10 km | 7 km | PHP 36 |
| Review threshold: 42 km | 39 km | PHP 100 |

For covered Plaza-origin journeys, the exact matrix amount takes priority; a fitted formula never replaces it. The Poblacion row applies only to the separate within-Poblacion reference case. Unsupported geography, origin, destination or service yields unavailable.

## Proposed private-hire methodology

Regular service intends to reserve the entire tricycle for a booking party. This is distinct from authorization of the published per-passenger fare. A proposed exclusive-hire amount combines occupied-passenger fares with a fraction of the reference fare for unused capacity:

```
total = passengers * reference
      + (explicit_capacity - passengers) * reference * compensation_rate
```

The initial proposal uses 10% through 3 km, 15% over 3 through 7 km, and 25% over 7 km. These are proposed empty-capacity compensation bands, not authorized charges for empty seats. There is no additional kilometer charge after the passenger reference fare has been calculated. Monetary rounding occurs once on the combined unused-capacity compensation.

The following uses an **unverified example capacity of five solely for simulation**. Every real vehicle would require documented, current legal passenger capacity; this example assigns no seats to a driver or vehicle.

| Synthetic distance / reference / compensation | 1 passenger | 2 passengers | 3 passengers | 4 passengers | 5 passengers |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 km / PHP 22 / 10% | PHP 30.80 | PHP 50.60 | PHP 70.40 | PHP 90.20 | PHP 110.00 |
| 5 km / PHP 26 / 15% | PHP 41.60 | PHP 63.70 | PHP 85.80 | PHP 107.90 | PHP 130.00 |
| 10 km / PHP 36 / 25% | PHP 72.00 | PHP 99.00 | PHP 126.00 | PHP 153.00 | PHP 180.00 |

For the separate formula illustration of a PHP 30 reference, one passenger, five-seat example and 25% compensation, PHP 30 + (4 × PHP 30 × 25%) = **PHP 60**. This example illustrates the formula and does not claim a measured route for a PHP 30 reference.

Per-person averages for the short example are PHP 30.80, 25.30, 23.47, 22.55 and 22.00 respectively; presentation rounding of an average does not change the integer-centavo group total. The dashboard displays both total and per-person average for each scenario.

## Affordability, driver costs and comparison

The proposed exclusive charge can substantially exceed a single published passenger fare. Review should consider passenger willingness and ability to pay, public fare clarity, group size, accessible alternatives, and whether exclusive service can be offered lawfully without impairing existing regulated service. Passengers must never discover an unused-seat charge after confirmation. None of these simulations authorizes a public quote.

Fuel consumption and price, maintenance allocation per kilometre, trip and waiting time, and the likelihood/distance of empty return journeys have **not been measured or supplied**. No driver cost or income figure is claimed. The dashboard accepts explicitly illustrative expense and time assumptions in a separate earnings scenario. Its remainder is scenario revenue less supplied fuel, maintenance and empty-return expense, before other costs; it is neither a fare component nor a driver settlement. Avoid counting return fuel twice when specifying assumptions.

The matrix is the comparison baseline. The calibration workflow accepts exact destination labels, measured road metres and measurement references, then compares candidate kilometre rates using the chosen draft base, allowance, increment, rounding and explicit maximum. It reports average/median fares, measured-distance mean, effective PHP/km differences, signed and absolute prediction errors, percentage errors and mean absolute errors. An outlier is diagnostically flagged at absolute percentage error of at least 20%; that threshold grants no authority to change a tariff.

**Current measurements: none supplied.** Average road distance, destination-level predictions and errors, outliers and a preferred fitted rate cannot yet be established. The comparison must report missing rows rather than infer distances from fares. Survey the 42 Plaza routes under approved routing conditions; retain route reference, measurement method and date. Synthetic examples must remain identified separately from measured data.

## Discount treatment

For Plaza matrix references, use the exact printed discounted amount. Do not derive a universal percentage from the regular amount. Off-Plaza discounted base and kilometre rates are separate, initially unavailable settings. Discounted unused-capacity compensation also requires a separate explicit assumption; no rule is inferred from the regular bands. Illustrative discounted simulations identify their assumptions. Mixed passenger categories, discount stacking, eligibility verification and the treatment of unused capacity for discounted riders remain unavailable for real quotation pending approved rules.

## Capacity, geography and administrator controls

Operational prerequisites include verified legal seating capacity, city/TODA/vehicle authority, approved pickup/destination coverage and permitted road routes. M3 stores city-scoped applicability and explicit local simulation origin/destination cases. It does not establish a legal geofence or an approved route network. M4 booking integration, M5 routing/GPS acceptance, Special itineraries and independently booked Shared seats are outside this proposal's engineering scope.

Authorized city editors may import sources, create immutable revisions, change distance/discount parameters and compensation bands, simulate, and submit drafts. A different city approver with fresh MFA may approve or reject the exact submitted version. Revision checks and transactional locks prevent conflicting edits/decisions. Audit and outbox records commit with the change. Source records, policy versions and calculation snapshots remain historical records. Historical prices are never recalculated with a later policy.

Administrator approval means approval of a proposal in the local workflow. **Activation remains CLOSED**, `fare.activate` remains unassigned, and payable requests return unavailable. New pricing parameters cannot rewrite the published source matrix. No public booking, dispatch, provider, driver-operation or production gate is opened.

## Questions for the appropriate Tuguegarao authorities

1. Which signed tariff version, ordinance and effective/publication dates govern the supplied matrix? What exact geographic areas and route exceptions apply, including Poblacion and reverse trips?
2. Is exclusive Regular hire legally permissible, and what separately approved method may determine its price? Is unused-capacity compensation permitted, and under what disclosure/consent rules?
3. What off-Plaza base, included road distance, kilometre rate, increments, rounding, long-trip review and maximum rules, if any, should be authorized after route and affordability studies?
4. How are student, senior and PWD eligibility, mixed groups, children and overlapping entitlements treated? How do discounts affect the private-hire component?
5. What documents establish vehicle passenger capacity and permitted city/TODA pickup, service areas and road routing?
6. What measured fuel, maintenance, time and empty-return evidence should inform the economic assessment, without substituting assumed driver costs for legal tariff approval?
7. Who may approve the legal tariff, administer changes and separately authorize activation, with what notices, effective-date controls, appeal and monitoring requirements?

No approval or signature is implied. Required measurements and documentary decisions remain pending formal review.
