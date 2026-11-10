# Admin app — implementation slot

**M3 local implementation:** Fare Management now uses the M2 Keycloak/TOTP session
and current PostgreSQL city grants. The editor/reviewer workspaces import the
43-row matrix, edit versioned distance/private/discount proposals, simulate,
calibrate and record independent reviews. Activation is always CLOSED.

For an existing manifest-verified administrator fixture, run `pnpm.cmd m3:prepare`
once, then `pnpm.cmd dev:admin:api` and `pnpm.cmd dev:admin:identity`. This applies
incremental migration 0009 only inside the disposable test cluster; it preserves
users, grants and credentials and never provisions staff. Enter the assigned city
identifier in Fare Management. `CITY_FARE_EDITOR` and `CITY_FARE_APPROVER` are
existing permissions; granting them remains owner-controlled fixture setup.

Run `pnpm.cmd test:m3:pricing` and `pnpm.cmd test:m3:integration` for focused
pricing and actual Nest/PostgreSQL/Chromium acceptance. The latter uses synthetic
session proofs at the established M2 authorization boundary; it does not claim a
new live Keycloak login test. See the [LGU proposal](../../docs/67-TUGUEGARAO-PROPOSED-FARE-FRAMEWORK.md).

**M1 update:** `pnpm.cmd dev:admin` boots the local unprivileged navigation preview.
Overview checks typed API health through Vite's proxy; Fare Management displays
"Not yet approved" without editing or publishing fares. No admin session exists.
See `../../docs/49-M1-FOUNDATION.md`; the module list below remains future scope.

React + Vite + TypeScript SPA. Generate in this folder using vetted current versions when starting milestone M1. Use typed generated OpenAPI client, accessible design tokens, route-level role/tenant guards and server-side authorization. No Next.js required.

Modules: superadmin, tenant operations, terminal queues, driver verification, fares and zones, ride monitoring, incident management, reports.

**Tuguegarao pilot v1.5:** See `docs/38-BOOKING-MVP.md`, `docs/41-AUTH-PRIVACY.md` and `docs/44-ADMIN-SCREEN-CONTRACT.md`. All fare rows remain draft/unverified. Only verified legal policies enable live bookings.
