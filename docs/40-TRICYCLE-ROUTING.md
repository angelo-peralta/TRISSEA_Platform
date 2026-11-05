# Tricycle-Routing Constraints — Tuguegarao

## Legal and map requirements
- Obtain **current** city road restrictions, permitted national-highway exception segments, active road closures, TODA/MTOP zones and legally allowed pickup points from Tuguegarao City/TRU. A street being geographically connected or accessible by a motorbike does not make it lawful for tricycles.
- City Ordinance No. 09-08-2021 restricts tricycles from national highways and lists exceptions for portions of Cagayan Valley Road, Enrile Avenue bypass, Tanza-Caggay Highway, Maharlika Road and Cagayan-Apayao Road, subject to its conditions. **Older ordinance; validate amendments/continued applicability before live deployment**. Source: https://tuguegaraocity.gov.ph/public/files/issuances/2021/ORDINANCE/Ord.%20No.%2009-08-2021.pdf
- Determine permitted parts of those roads with CITY GIS polygons/edge IDs; do not apply blanket permission to their entire lengths.
- Routing backend requires tricycle-specific restricted edge/turn-cost profile (OSRM/Valhalla/custom provider) plus permit/TODA service zone boundaries. MapLibre renders map, not legality.

## Engine behavior
1. Geocode address/pin; check service zone and accessibility. Route profile must avoid prohibited segments and note uncertain segments.
2. If mapping data unclear or no legal path, `ROUTE_UNVERIFIED`/`SERVICE_AREA_RESTRICTED`; no fabricated ETA or fare.
3. Return route metadata `{ routeProfileVersion, regulatorySourceId, roadEdgesHash, distanceMeters, etaSeconds, confidence }`; route and fare snapshots stored with booking.
4. No automatic operation outside active city or driver-permitted TODA area, even if ETA shorter.
5. Track road-edge access change and revalidate new bookings; ongoing trips use safe fallback process.

## Field QA
Test by actual driver/TODA subject-matter expert for representative route pairs: poblacion↔poblacion, each named outer area, national-highway crossing, dead-end, one-way, bridges, flooding/construction scenarios, narrow roads, no cell service and GPS drift. Every proposed routing map needs reviewer sign-off.
