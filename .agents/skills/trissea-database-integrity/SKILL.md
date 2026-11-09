---
name: trissea-database-integrity
description: Design, implement and verify TRISSEA PostgreSQL/PostGIS/Drizzle schemas, SQL constraints, migrations, transactions, tenant isolation, RLS and concurrency-critical persistence. Use for schema or transactional database changes, not for routine read-only API changes.
---

# Database integrity and migrations

## Before touching schema

Inspect migration ledger/checksums, Drizzle schema, current queries/transactions, indexes, real use cases and applicable ADR. Determine whether the target is a disposable test DB, local development DB or persistent deployment. Never assume reference SQL is a runnable migration.

Use the canonical `trissea-dev` project and `dev:infra:*` workflow (ADR 66), not per-milestone Docker projects. Manifest-verified fixture databases live in the separate `postgres-test` cluster; its owner authority must never reach core application or Keycloak data. Ordinary stop/restart preserves volumes and migration history. No global pruning, legacy infrastructure resurrection, volume deletion or automatic production provisioning.

## Schema discipline

- Model unique constraints, composite city/TODA FKs, check constraints, immutable audit references and exact lifecycle versions in DB, not just controllers. Use UTC `timestamptz`, explicit enum/check policies and appropriate indexes.
- Separate migration owner and least-privilege runtime database users; prove that scoped request context cannot leak between pooled connections. RLS supplements, not substitutes, checked application authorization.
- Write incremental, reviewed up/down migration files and compatible Drizzle definitions. Preserve history/checksums; no silent destructive column changes, bulk data deletion or unreviewed `push` of generated schema.
- For hot paths use transactions, locks or CAS as proven by requirements, not guesses. Same driver cannot accept competing exclusive engagements; duplicate OTP redemption, booking and fare approvals must be DB-enforced.
- Avoid storing plaintext OTP, refresh tokens, personal documents or raw contact lookup indexes. Retention, encryption keys and removal procedures require approved policies.

## Verification

1. Apply on a **named disposable DB** with explicit target identity; verify fresh up, repeat up, down/reapply and unrelated sentinel data preservation.
2. Test uniqueness/foreign key/check constraints with positive and failing fixtures.
3. Prove race cases with real concurrent transactions and audit/outbox consistency; test rollback on partial failure.
4. Verify RLS/SQL-role isolation if used, and examine query plans only for relevant performance paths.
5. Report migration names, affected tables, data/backfill risks, exact test DB type, executed commands and rollback limits. Never run production DDL or destructive tests by default.
