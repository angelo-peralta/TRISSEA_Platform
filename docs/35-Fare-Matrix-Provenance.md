# Tuguegarao 2026 Fare Images — Provenance and Import Rules

## Provenance
- User-provided image `data/fare-matrix/source-images/matrix-page-1-user-supplied.jpg` lists 21 areas.
- User-provided image `data/fare-matrix/source-images/matrix-page-2-user-supplied.jpg` lists 21 additional areas and a separate **within-poblacion** fare: **regular ₱22, student/senior/PWD ₱18**.
- Manually transcribed all 42 area rows in `data/fare-matrix/tuguegarao-fare-matrix-user-supplied.csv`. Columns are **regular** and **discount category**; CSV amounts are PHP, not centavos.
- Some named entries refer to barangays, others to areas/landmarks (e.g. City Hall/RGC/CVMC, Capitol/MCNP, CSU Carig); do not automatically assume every label is a canonical PSA barangay.
- The supplied materials do **not** specify a clear common origin/direction for all 42 listed area rates. Do not assume fares are valid between arbitrary pairs of areas, or reverse direction.
- Do not infer that these are private-trip fares or a legal fixed price for service options. The screenshots do not state legal seat count or full-unit pricing methodology.

## External cross-check context (not proof of the uploaded images' legal effective date)
- Tuguegarao council approved a temporary fare increase in April 2026; subsequent reporting says implementation began June 20, 2026, for the regular fare change.
  - https://rmn.ph/%F0%9D%97%A3%F0%9D%97%94%F0%9D%97%A1%F0%9D%97%A6%F0%9D%97%94%F0%9D%97%A0%F0%9D%97%94%F0%9D%97%A1%F0%9D%97%A7%F0%9D%97%94%F0%9D%97%9F%F0%9D%97%94%F0%9D%97%A1%F0%9D%97%9A-%F0%9D%97%99%F0%9D%97%94/
  - https://tuguegarao.bomboradyo.com/tru-tuguegarao-nagbabala-laban-sa-mga-tricycle-driver-na-naningil-na-ng-dagdag-pasahe-bago-ang-itinakdang-petsa/
- Government authority for tricycle fares, MTOP, and service zones (Supreme Court E-Library): https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/11/47970

## Before an admin can activate a fare set
1. Receive original official ordinance/approved matrix, number, date signed, effective date, publication proof and authorized office.
2. Determine matrix **origin** and direction, exact coverage polygons, whether amounts are per passenger/seat or private whole-unit, and any route exceptions.
3. Verify rounding, discount category verification, children, nighttime or other permitted surcharges and service-specific policies.
4. City fare editor imports as DRAFT. Separate city fare approver reviews two-person comparison, attaches source and publishes version for future rides.
5. Keep immutable history of previously quoted prices; NEVER silently rewrite completed trip fares or existing quotes.

## Import QA

M3 owner confirmation (10 November 2026): the supplied matrix is from Tuguegarao
LGU, with Plaza as the origin, one-way per-passenger amounts and the exact printed
discounted prices. This supersedes the earlier unknown-origin engineering
assumption above. The importer retains the original CSV fields unchanged and
stores this confirmation separately. It does not confirm reverse-direction use,
tariff effective dates or exclusive-hire authorization. See the
[proposed framework](67-TUGUEGARAO-PROPOSED-FARE-FRAMEWORK.md).
- 42 named rows, plus 1 poblacion-only row; no duplicate destination labels. All prices are ≥0 and each printed discount does not exceed printed regular fare.
- Each row links to a screenshot page, import timestamp, reviewer and signed supporting ordinance once acquired.
- Distinguish `DRAFT_UNVERIFIED`, `UNDER_REVIEW`, `APPROVED_SCHEDULED`, `ACTIVE`, `SUPERSEDED`, `REJECTED`.
- Seed into **sandbox staging only**, and block production activation without the approval metadata.
