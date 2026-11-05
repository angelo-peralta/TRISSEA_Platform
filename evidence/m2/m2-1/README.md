# M2.0 / M2.1 actual local evidence

2026-11-05, Windows 11, Node 22.17.0 / pnpm 11.20.0. Branch
`feat/m2-identity-foundation`, based on merged M1 `553c5d7`.

- `commands.json`: actual exit codes/times and reviewed source hashes.
- `validation.txt`: lint, strict workspace TypeScript, contract checks, 20 tests,
  API/admin builds; exit 0.
- `database-tests.txt`: 11 real isolated PostgreSQL tests, all passed, no skips.
- `database-results.json`: actual checkpoints, random disposable database name,
  PostgreSQL 17.5/PostGIS 3.5.2.
- `dependency-audit.txt`: moderate policy passes; one inherited low advisory.
- `blueprint.txt`, `diff-check.txt`: documentation/whitespace validation.

Synthetic records only. No OTP, password, signing key, connection URL, real person
or government document is included. Logs do not claim live SMS, Keycloak login,
Android/browser authentication or production acceptance. The ephemeral PostGIS
cluster uses loopback 15433 and no volume; M1 data/Redis are untouched.

See [implementation review](../../../docs/57-M2-IDENTITY-FOUNDATION.md).
