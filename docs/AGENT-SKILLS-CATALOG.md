# TRISSEA project-local skills — catalog

This page is a human-readable inventory, **not** a single massive `SKILLS.md` instruction file. The Codex-executable skill entry point is each `.agents/skills/<name>/SKILL.md` with front matter `name` and `description`. `AGENTS.md` is the mandatory repository contract.

| Skill | Trigger | Typical owner | Status |
| --- | --- | --- | --- |
| `trissea-engineering-workflow` | Nontrivial feature/bug/refactor | All coding tasks | Proposed |
| `trissea-env-config` | Env keys, scripts, Docker, CI, Keycloak/SMS config | Backend/DevOps | Revised |
| `trissea-mobile-design` | Mobile UI/routes/a11y/Expo | Passenger/driver | Revised |
| `trissea-backend-api` | NestJS modules/endpoints/workers/OpenAPI | Backend | Proposed |
| `trissea-database-integrity` | Postgres/Drizzle/migrations/RLS/transactions | Data | Proposed |
| `trissea-auth-security` | OTP/Keycloak/session/roles/privacy | Security | Proposed |
| `trissea-testing-acceptance` | Tests/CI/emulator/QA evidence | QA | Proposed |
| `trissea-code-review` | PR/diff audit, review | Reviewer | Proposed |
| `trissea-git-delivery` | Git commit/push/PR/CI actions | Delivery | Proposed |

## Skills to add later only when needed

- `trissea-dispatch-state-machine`: booking, exclusive driver engagement, queue and concurrency.
- `trissea-pricing-and-fare-governance`: draft/versioned LGU fare rules, maker-checker, immutable snapshots.
- `trissea-mobile-native-gps`: background location/native dev builds and evidence protocol.
- `trissea-admin-ui`: dashboard accessibility, data tables, review workflows and permission-sensitive UX.
- `trissea-observability-operations`: structured logs, tracing, metrics, incidents and recovery drills.

Do not create a separate skill for every component or repeat global Git/security policy in every skill. If two skills always trigger together and duplicate procedures, consolidate them.
