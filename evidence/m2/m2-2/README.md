# M2.2 actual local authorization evidence

2026-11-05, Node 22.17.0 / pnpm 11.20.0 on Windows. Feature branch
`feat/m2-authorization`, based on reviewed local M2.1 `e83c335`.

- `commands.json`: actual command exits/times and executed source SHA-256 hashes.
- `validation.txt`: 56 tests, contract generation, lint, strict workspace TypeScript,
  API/admin builds; exit 0.
- `authorization-database-tests.txt` / `database-results.json`: 12 real isolated
  Postgres/Fastify tests, migration/role/RLS/audit/concurrency checkpoints; exit 0.
- `identity-regression-tests.txt` / `identity-regression-results.json`: 11 M2.1
  tests pinned to migration 0002; historical M2.1 evidence is preserved.
- `dependency-audit.txt`: unchanged moderate threshold passes; one inherited low
  advisory. `blueprint.txt` and `diff-check.txt`: pass.

Dedicated new disposable databases, loopback 15433, PostgreSQL 17.5/PostGIS 3.5.2,
UTC. M1 databases, Redis and volumes untouched. Synthetic users/resources only;
credential proofs are test-only DI objects, not JWT/Keycloak/SMS acceptance.
No real credentials, connection URLs, phones or identity documents are included.

[Implementation and remaining gates](../../../docs/58-M2-AUTHORIZATION.md).
