# API service — implementation slot

**M1 update:** source now implements only `GET /v1/health`, a global default-deny
authentication guard, an authorization example and foundation metadata schema.
Run `pnpm.cmd dev:api` from the root. See `../../docs/49-M1-FOUNDATION.md` for
validation limits. The following module plan remains future scope.

NestJS + Fastify + TypeScript modular monolith. Do not generate controllers until the OpenAPI and initial domain tests are reviewed. Modules: identity, tenants, drivers, terminals, pricing, rides, dispatch, payments, safety, audit, realtime, common.

Use Drizzle for ordinary CRUD, PostgreSQL parameterized transactions for hot-path state changes. API is the only writer of authoritative operational data. Prefer adapter boundary for OTP, SMS, routing, payments and storage.

**Tuguegarao pilot v1.5:** See `docs/38-BOOKING-MVP.md`, `docs/41-AUTH-PRIVACY.md` and `docs/44-ADMIN-SCREEN-CONTRACT.md`. All fare rows remain draft/unverified. Only verified legal policies enable live bookings.
