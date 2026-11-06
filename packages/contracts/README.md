# Shared contracts

M1 implementation uses `../../contracts/openapi-mvp.yaml`. Run
`pnpm.cmd contracts:generate` and `pnpm.cmd contracts:check`; generated DTO and
operation types live in `src/generated/m1.ts`. The health client and explicitly flagged
M2.3 passenger identity transport are implemented. Other MVP operations remain
future design.
The historical broad-contract note below is retained; v1.5 takes precedence.

`../../contracts/openapi.yaml` is the canonical initial API design. Generate shared TypeScript clients/types for Expo passenger/driver, React admin, and NestJS clients after contract review; do not hand-maintain divergent DTOs. Socket events require versioned JSON schemas. API remains authoritative on all state transitions.

## Passenger identity transport

`createPassengerClient` exposes a typed `request(operation, input)` for the ten
M2.3 local-synthetic identity operations. Requests and responses are validated
against the generated MVP schema. Credentials stay with the caller; the transport
omits cookies, performs no automatic retry and persists nothing. Native consumers
must use app-specific secure storage and serialize refresh, reusing the original
idempotency key after response loss. The backend local feature flag and external
approval gates still apply. See `docs/59-M2-PASSENGER-AUTHENTICATION.md`.

`createDriverClient` uses the same reviewed generator with DRIVER-only
request/response purpose, a DRIVER status header, and the eleven protected driver
operations. Four shared operation aliases keep existing OpenAPI IDs stable.
`PassengerApiError` and `DriverApiError` contain safe status only. Neither client
stores credentials; native consumers must use separate secure storage namespaces
and serialized refresh. M2.4 backend evidence is in doc 60; native storage has not
been accepted by these transport tests.
