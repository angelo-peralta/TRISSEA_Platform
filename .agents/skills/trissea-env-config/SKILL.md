---
name: trissea-env-config
description: Implement or review TRISSEA configuration across .env.local, .env.production, example templates, NestJS validation, Docker Compose, Keycloak, Redis, PostgreSQL, PhilSMS, Vite/Expo, pnpm scripts and CI. Use whenever environment variables or startup/config behavior change; not for unrelated code edits.
---

# Environment configuration — consistent, validated and secret-safe

`AGENTS.md`, ADRs and applicable Git policy control authorization. The skill does not authorize real SMS, provider enrollment, production access or secret provisioning.

## Inspect before changes

- Check actual config consumers: `process.env`, `import.meta.env`, Expo public env, Docker interpolation, `node --env-file`, package scripts, Compose and CI. Check `git ls-files`, `.gitignore` and env examples without printing secret values.
- Inventory primary/sibling root, application and archived dotenv files without printing values. Use the canonical boundary in `scripts/environment.cjs`; verify its current implementation and named profile mappings. Preserve existing database URLs, credentials, volumes, AVDs, ports and user-specific values. Retired files require an exact owner-approved cleanup manifest before deletion; do not remove the sibling or its bind-mounted configuration.
- Record each variable's owner, type, valid values, required environments, sensitivity, default and consumers. Inventory first, then edit.

## File contract

| File | Purpose | Git |
| --- | --- | --- |
| `.env.local` | Local development only | Ignore; never overwrite user values silently |
| `.env.local.example` | Safe, complete local reference generated from the schema | Track |
| `.env.production.example` | Safe production variable contract | Track; add explicit `.gitignore` exception |
| `.env.production` | Optional local preparation file, **not** preferred deployed secret storage | Ignore; no actual secrets unless securely owner-provisioned |
| Legacy `.env`, `.env.example`, `.env.m1.local`, `.env.m2-*` | Retired under the approved Task 5A manifest; never recreate | Preserve excluded archives/sibling files; do not stage secrets |
| CI/test variables | Ephemeral synthetic fixtures + securely injected secrets | Never commit credentials |

- Exactly four approved root dotenv files are the target. Do not claim consolidation complete while obsolete files remain. Document deterministic precedence: trusted process injection outranks the selected profile's canonical settings; local commands load only `.env.local`; production never reads local files or silently enables mocks. Use `.env.production` only explicitly; prefer approved secret injection.
- `docker compose --env-file` supplies interpolation, not necessarily service-process environment. Map variables explicitly. Validate the *effective structure*, never print real secrets.
- Check whether Expo/Vite read root env files; use documented package loading without exposing backend secrets through `VITE_*` or `EXPO_PUBLIC_*`.
- Distinguish service URLs visible to Android emulators/phones, host machine and Docker containers; localhost does not refer to the same host everywhere.

## Implement

1. Build/extend one typed server configuration boundary with sanitized variable-*name* errors. Validate permitted environment, origin/TLS, Keycloak issuer/realm/client, database, Redis, token keys and feature gates as relevant.
2. Reject mock SMS, fixed OTPs, development realm settings, absent live-provider approval, weak/default credentials and missing signing/encryption keys in production. `SMS_LIVE_ENABLED=true` alone is never authorization to send.
3. Update app/script/Compose/CI consumers, `scripts/environment-schema.cjs`, `.env.local.example` and `.env.production.example` together. Run `node scripts/generate-environment-examples.mjs --check`. Preserve independent security-role credentials with explicit namespaces; never combine M1/IdP/test databases. Keep conditional production-only requirements separate.
4. Maintain `.gitignore`: ignore actual `.env*` secrets; explicitly allow tracked examples. Verify with `git check-ignore -v` and `git ls-files`.
5. Add parity tests (consumed vs documented keys), invalid/absent/conflicting settings, loading precedence and production fail-closed behavior. Use mocks for any external API.
6. Document working PowerShell (`pnpm.cmd` where necessary) and Linux CI commands, required setup values and manual provisioning boundaries.
7. Before cleanup, record every obsolete file, replacement, preserved-data proof, migrated-reference status and removal condition. Use approved encrypted backups outside the active dotenv structure for private settings. Stop for explicit owner approval of the exact manifest; no broad recursive dotenv deletion, implicit cleanup, staging or publication.

## Acceptance

- Local setup starts with `.env.local` and the single `trissea-dev` project in `infra/compose.dev.yml`; use `dev:infra:*` scripts only. See ADR 66. Do not resurrect legacy infrastructure. Preserve existing data/credentials; ordinary down stops containers without deleting volumes. Never globally prune Docker resources or automatically provision production.
- Isolate tests with randomly named manifest-verified disposable databases, least-privilege runtime roles and Redis namespaces. Keep fixture-owner authority in `postgres-test`, separate from core application/Keycloak databases. Do not create permanent per-milestone Compose projects or dotenv files.
- Production validation rejects missing/unsafe settings and never falls back to local files, insecure provider settings or mock OTP.
- Example templates and test fixtures correspond to actual consumed keys; CI checks catch drift.
- No secrets appear in tracked files, command output, bundles, telemetry, PRs or logs.
- Report changed variable **names**, tests actually executed, remaining unprovisioned keys and approval gates. Never report secret values.
