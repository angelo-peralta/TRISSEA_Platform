# M2.3 accepted local backend evidence

Captured 2026-11-06 PHT from `feat/m2-passenger-auth`, after the fixes described
in [the implementation record](../../../docs/59-M2-PASSENGER-AUTHENTICATION.md).
Only synthetic data and mock/stub SMS transports were used. These files contain
no captured codes, bearer/refresh credentials, key files, phone records or env files.

| Evidence | Result |
| --- | --- |
| [Full validation](validate.txt) | Exit 0: contract check, lint, all workspace types, 5 client + 49 API + 9 repository tests, API/admin builds |
| [Passenger integration](passenger-auth.txt) | 15/15, real isolated PostgreSQL/Redis, actual root Nest/Fastify module, all ten generated-client operations |
| [Passenger checkpoints](results.json) | Safe identifiers and individual acceptance observations |
| [M2.1 regression](identity-regression.txt) | 11/11; prior schema boundary and migration preservation |
| [M2.2 regression](authorization-regression.txt) | 12/12; current DB authorization, positive and negative cases |
| [Frozen install](frozen-install.txt) | Exit 0 with reviewed lockfile |
| [Audit](audit.txt), [advisory summary](audit-summary.json) | Moderate gate exit 0; one existing LOW `deepmerge` GHSA-gcqx-w48m-w2h4 remains |
| [Blueprint](blueprint.txt) | Exit 0; documentation sanity check, not application acceptance |
| [Command exit/timing record](final-commands.json) | Actual subprocess exits and elapsed seconds |
| [Environment/startup observations](environment.json) | PostgreSQL 17.5/PostGIS 3.5.2, Redis 7.4.12 PONG, local API 4100 health 200, no-token profile 401 |

TAP evidence determines the pass counts; the checkpoint file alone is not a test
runner verdict. Logs captured by the final Python wrapper contain stdout followed
by stderr. Regression logs were decoded from PowerShell UTF-16 into UTF-8 without
changing their results. Earlier failing/debug runs were not substituted for passes.

Failures were exercised through expired/consumed Redis keys, five wrong codes,
real closed Redis/PostgreSQL transports, and an explicitly injected DB failure
after OTP consume. Time-window tests age synthetic fixtures; they do not weaken
runtime limits. No destructive test touched M1 ports, volumes or existing databases.

No remote CI, live carrier delivery, Android/native secure storage, physical
device, Keycloak browser/TOTP or production capacity acceptance is claimed.
Gates A–E remain closed. M2.4 requires owner approval; no publication is authorized.
