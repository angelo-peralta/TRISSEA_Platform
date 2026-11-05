# Admin app — implementation slot

**M1 update:** `pnpm.cmd dev:admin` boots the local unprivileged navigation preview.
Overview checks typed API health through Vite's proxy; Fare Management displays
"Not yet approved" without editing or publishing fares. No admin session exists.
See `../../docs/49-M1-FOUNDATION.md`; the module list below remains future scope.

React + Vite + TypeScript SPA. Generate in this folder using vetted current versions when starting milestone M1. Use typed generated OpenAPI client, accessible design tokens, route-level role/tenant guards and server-side authorization. No Next.js required.

Modules: superadmin, tenant operations, terminal queues, driver verification, fares and zones, ride monitoring, incident management, reports.

**Tuguegarao pilot v1.5:** See `docs/38-BOOKING-MVP.md`, `docs/41-AUTH-PRIVACY.md` and `docs/44-ADMIN-SCREEN-CONTRACT.md`. All fare rows remain draft/unverified. Only verified legal policies enable live bookings.
