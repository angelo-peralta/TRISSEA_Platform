# GitHub Copilot repository instructions

Follow `AGENTS.md` and `docs/15-AGENT-WORKFLOW.md`.
Preferred stack: React Native + Expo + TypeScript passenger/driver; React/Vite admin; NestJS/Fastify API; PostgreSQL/PostGIS; Drizzle + SQL; Redis/Socket.IO/BullMQ with transactional outbox.

Do not generate client-authoritative ride statuses, fare calculations, queue positions or driver verification. All active ride/offering and queue operations must be server-validated and transactionally safe. Always include role + tenant checks and idempotency for writes.

Read `docs/03-DISPATCH-RULES.md` and `docs/04-RIDE-STATE-MACHINE.md` before editing ride code. Read `design/DESIGN-BIBLE.md` before UI work. Tests and API contract must accompany changes.

ADR-008: Reservation is passenger-owned pickup window at authorized TODA terminal. Never make driver future queue-booking or bypass FIFO. Read `docs/28-TODA-RESERVATIONS.md`, protect quota with DB transaction and verify in-person check-in before linked ride dispatch.

Mobile UI work must follow `design/MOBILE-DESIGN-RULES.md`, `design/MOBILE-COMPONENT-CONTRACTS.md`, `design/MOBILE-SCREEN-ACCEPTANCE.md` and `.agents/skills/trissea-mobile-design/SKILL.md`. See `design/MOBILE-AGENT-REPOS.md` for secondary external skills. Never substitute external aesthetics for TRISSEA tokens or operational truth.

**v1.5 update:** Read root `AGENTS.md` and `docs/00-PILOT-STATUS.md` FIRST. Tuguegarao tricycle pilot, uploaded 42+1 fare rows in DRAFT only, on-demand Regular first, Special/Shared gated, terminal passenger Reservation deferred, role-based fare approval and legally restricted roads. Do not infer lawful prices or permitted routes.
