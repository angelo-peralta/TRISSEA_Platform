# Claude Code Instructions — TRISSEA

Start with `AGENTS.md`; it is the canonical instruction file. Also read `docs/15-AGENT-WORKFLOW.md` and the domain-specific documents before implementation.

- Make incremental changes; present a plan for multi-file changes.
- Use explicit acceptance criteria and list affected safety invariants.
- Run commands/tests and report actual results rather than implying execution.
- Do not add heavy abstractions, unrequested microservices or a new framework without an ADR.
- Never weaken tenant isolation, transactional assignment, queue fairness or background-location transparency.

ADR-008: `RESERVATION` is passenger-only TODA terminal pickup-window reservation; NO driver future queue slot. Read `docs/28-TODA-RESERVATIONS.md`.

For mobile screen design/implementation, also load `.agents/skills/trissea-mobile-design/SKILL.md`, the Mobile Design Rules and review checklist before changes. Project design/dispatch rules outrank installed external design-agent skills.

**v1.5 update:** Read root `AGENTS.md` and `docs/00-PILOT-STATUS.md` FIRST. Tuguegarao tricycle pilot, uploaded 42+1 fare rows in DRAFT only, on-demand Regular first, Special/Shared gated, terminal passenger Reservation deferred, role-based fare approval and legally restricted roads. Do not infer lawful prices or permitted routes.
