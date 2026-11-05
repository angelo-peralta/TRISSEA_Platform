# TODA Operations — Seat Booking, Door Pickup and Terminal Reservation

## Explicit business distinctions
- **TODA/MTOP:** legal operating authority and assigned zone, not merely an app-created organizational label.
- **Seat-booking at terminal:** passenger buys seat(s) and is physically present at designated terminal/approved boarding point; future time-slot reservation workflow is deferred to later release.
- **Off-terminal pickup by a TODA:** candidate policy states passenger must hire and pay the whole unit/full legal passenger seats. Requires city/TODA confirmation before activation. Fare preview explains difference in service and full-vehicle basis.
- **On-demand Regular:** passenger's requested location is pickup, but only if driver's authorization and permitted roads allow it; quote is exclusive/whole-unit, not a per-seat discount unless legally defined.
- **Shared:** multiple passengers with route/seat capacity, on approved corridors or pickup points only. Cross-TODA pickup eligibility must be verified, not inferred.
- **Special:** an exclusive booking; same pickup legal checks plus itinerary and waiting rules.

## TODA admin workflow (once enabled)
City admin verifies TODA registration and service geography → TODA manager submits driver and vehicle documents → verification officer reviews → driver shift assigned to TODA zone → dispatcher can see eligible drivers and assist requests within scope. Suspension or expired documents instantly remove driver from new dispatch, while ongoing rides are handled using an auditable safe policy.

## Reservation (deferred, decisions preserved)
Passengers reserve future pickup window at an authorized TODA terminal; check in physically; on check-in, request fare quote and consent; eligible FIFO queue driver then assigned. No reservation of driver queue position, no guarantee of a specific vehicle. Previous ADR-008 still applies. See `docs/28-TODA-RESERVATIONS.md`.

## Questions for LGU/TODA sign-off
1. Which TODAs are authorized for citywide on-demand pickups vs strictly terminal zone trips?
2. Are Shared rides legally allowed for arbitrary door-to-door pickups or only defined terminal/corridor trips?
3. Does a passenger who requests off-terminal pickup pay exactly each legal seat×fare, a separate whole-unit tariff, or a special-rate amount?
4. Are full-seat fare and vehicle maximum capacity uniform across tricycles? Verify using vehicle documents and applicable standards.
5. Can a driver decline a request without losing position in terminal queue (future phase)?
6. Is a separate dispatcher or TODA leader required to authorize bookings/queue movements?
7. Which pickup landmarks and city route boundaries are approved?

Until written approval: keep `reservation.enabled=false`, `terminalMode.enabled=false`, `shared.enabled=false` outside simulated tests. Regular may be built and tested with mock policies but not made public without approval.
