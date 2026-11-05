> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# Routing and Fare Calculation

## Routing architecture
MapLibre renders maps; it is not the routing engine. Routing adapter consumes a provider capable of Philippine road networks and emits route geometry, distance, ETA, source and freshness. Pilot can compare OSRM/Valhalla against commercial providers with observed local coverage; navigation licensing/offline maps must be separately evaluated.

## Address quality
Normalize place search and pickup pin separately. Use geographic bounds and map-matching where supported. Do not assume all barangay roads, alleys, tricycle stands or terminal routes are accurately mapped. Provide manual terminal names and landmark field.

## Quote model
- `base_centavos + distance_centavos + time_centavos + permitted fees - permitted discounts`.
- Server accepts only preapproved policy version and tax/fee configuration; final quote stored with explicit components.
- Quote is immutable for validity window, identified by UUID, tied to user/tenant, service, pickup/destination and route provider estimate.
- Actual fare adjustment (waiting time/toll/exception) requires documented policy and user disclosure.

## Route policy
- For terminal services use an approved route geometry or fixed fare policy as configured; passenger cannot redefine a regulated fixed route.
- If routing provider errors, use explicitly labelled estimate only when approved; otherwise `ROUTING_UNAVAILABLE`.
- Prices cannot depend solely on floating point kilometers; convert using fixed integer rounding rules and recorded input snapshot.

## Map tokens and licensing
Map tile, geocoding, traffic and routing providers have distinct pricing and licenses. Do not use public community OSM tile servers as an unrestricted commercial production tile CDN. Maintain attribution and billing controls.

## Option-specific quoting
- `REGULAR`: private direct route, approved fixed or metered basis.
- `SHARED`: discounted seat fare using versioned pooling policy, maximum wait/detour disclosure and party size; no cross-rider retroactive repricing without authorized policy.
- `SPECIAL`: whole-unit price for every ordered leg, stop and optional return leg; waiting charges must be explicit and documented.
- `RESERVATION`: passenger reserves a terminal pickup **window**, not a fixed fare, driver or queue position. Initial pilot default is **no reservation fee** unless independently authorized. Show indicative approved route fare before holding; obtain explicit consent to the current terminal ride quote at check-in before dispatch. No surprise fee, no sale of queue priority. See ADR-008.
