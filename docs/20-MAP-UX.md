# Maps, Wayfinding and Accessibility

## Passenger map
Primary pickup controls must remain usable even when map tiles lag. Use an accessible address/landmark input and one clear movable pickup pin. Show pickup and drop-off separately. Provide confidence/accuracy indicator for GPS and "Move pin" affordance.

## Driver map
Most visible information: next action, pickup location, distance/ETA, passenger identity after assignment, contact/safety. Never require reading dense text while vehicle moving; voice/navigation handoff uses approved provider.

## Terminal view
Display terminal name, official loading area, approved routes, queue position (where permitted), estimated wait clearly distinguished from guaranteed departure time, and geofence instructions. Queue should support text-only screen for low bandwidth.

## Failure states
Missing GPS, no routes, expired fare, no matching drivers, app offline, degraded maps, limited connectivity, cancelled offer, driver arrived but location stale; each has contextual recovery button and support details.

## Localization
English and Filipino-ready strings; tenant may add locally appropriate languages after review. Store server timestamps UTC and show Asia/Manila for pilot. Use ₱ formatting and clear rounding. Use high contrast, 44+ px touch targets and readable road labels.
