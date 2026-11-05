# Special rides — whole unit, multiple stops and round trips

## Product
Exclusive vehicle booking for one passenger booking party. Itinerary is pickup → 0..N intermediate stops → final destination; round-trip requires an explicitly represented return leg to the approved point. Limit stop count by versioned tenant policy, not a hidden client constant.

## Quote and booking
- Frontend sends ordered stops; backend validates permitted zone/route and calculates provider distance/time for the entire itinerary.
- Quote snapshot includes all stops, stop-dwell estimates, permitted return leg, fare components, rounding rules and explicit stop-wait charges.
- Every itinerary or round-trip change after confirmation uses a revision/quote workflow, driver notification, and affected-party consent. No silently added passenger stop.
- Terminal-based Special is available only when the terminal/operator policy permits whole-unit hire.

## Trip stop state
`PLANNED → APPROACHING → ARRIVED → SERVICED`; optionally `SKIPPED` with authorization/reason. Driver cannot finish until applicable stops are handled and passenger confirms the contractual final point, subject to safety overrides.

## Tests
Stop reorder, duplicate stop IDs, invalid area, long stop delay, round-trip return pickup, route provider error, fare version conflict, cancellation between stops, concurrent itinerary edit and completion, offline UI recovery.
