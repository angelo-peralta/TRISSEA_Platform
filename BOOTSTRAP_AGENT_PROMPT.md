# First Coding Agent Task — TRISSEA Tuguegarao Pilot (v1.5)

Build **only Milestone M1** in `docs/42-MVP-IMPLEMENTATION-GATES.md`: a pnpm TypeScript workspace with NestJS/Fastify API (health endpoint + example authorization interface), React/Vite admin shell, Expo Router passenger/driver shells, PostgreSQL/PostGIS+Redis Compose, repeatable migration tooling, typed MVP OpenAPI client generation, testing/lint CI and environment example. Preserve pre-existing blueprint docs and original fare images.

Before coding read: `AGENTS.md`, `docs/00-PILOT-STATUS.md`, `docs/34-TUGUEGARAO-PILOT-CHARTER.md`, `docs/37-ROLE-ACCESS-MATRIX.md`, `docs/41-AUTH-PRIVACY.md`, `contracts/openapi-mvp.yaml`, and `design/MOBILE-DESIGN-RULES.md`.

The user-provided 42 destination lines and ₱22/₱18 within-poblacion fare are **UNVERIFIED DRAFT SEED ONLY**. Do not implement public fare quotation or actual passenger bookings in milestone M1. Build reference fare admin UI shell only, with clear "Not yet approved" status. Phone OTP uses a development-only fake provider configured with `NODE_ENV=development` (never exposed in production); identity provider is replaceable with Supabase Auth + qualified SMS gateway later.

Milestone M1 definition of done: Windows instructions tested; DB starts; migrations are rollbackable; four frontend shells boot; typed health API responds; authentication guard and city/TODA authorization unit test run; static code and dependency audit pass; no private keys/phone/GPS exposed in logs. Do not falsely claim working bookings until M4 completes.
