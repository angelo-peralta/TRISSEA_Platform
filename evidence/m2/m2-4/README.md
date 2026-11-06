# M2.4 local backend acceptance evidence

Captured 2026-11-06 PHT on `feat/m2-driver-auth`, based on approved M2.3
`044ce8e`. [Implementation/limitations](../../../docs/60-M2-DRIVER-AUTHENTICATION.md).
Only mock SMS, synthetic identities/intake/vehicle/assertion fixtures and fresh
disposable databases were used. No live sending or real operating approval.

| Evidence | Actual result |
| --- | --- |
| [Full validation](validate.txt) | Exit 0: contracts, lint, seven workspace type checks, 82 API + 8 client + 9 repository tests, API/admin builds |
| [Driver acceptance](driver-auth.txt) | 15/15 real PostgreSQL/Redis/root Nest/Fastify cases and all 15 typed driver transport operations |
| [Driver checkpoints](results.json) | Individual acceptance observations; safe disposable identifiers only |
| [Passenger regression](passenger-regression.txt) | 15/15 with unchanged M2.3 migration boundary |
| [Authorization regression](authorization-regression.txt) | 12/12 at M2.2 boundary |
| [Identity regression](identity-regression.txt) | 11/11 at M2.1 boundary |
| [Frozen install](frozen-install.txt) | Exit 0; no dependency upgrades/additions |
| [Dependency audit](audit.txt) | Moderate threshold exit 0; pre-existing LOW deepmerge GHSA-gcqx-w48m-w2h4 remains |
| [Blueprint](blueprint.txt) | Exit 0; documentation sanity only |
| [Commands/exits/timings](final-commands.json) | Actual sequential subprocess results |
| [Environment/startup](environment.json) | Isolated PG/PostGIS and Redis PONG; standalone loopback 4101 health 200 and no-token driver profile 401 |

TAP determines pass counts; checkpoints alone are not a runner verdict. Logs
contain stdout followed by stderr, decoded to UTF-8 with trailing whitespace
removed. Captured OTPs/tokens stayed in test-process memory. These files include
no local key/configuration file, phone record, credential, raw document or GPS.
Earlier failing exploratory runs are not represented as acceptance passes.

Positive authentication/consent/intake/refresh/logout and positive synthetic
eligibility prevent an always-deny implementation from passing. Negative cases
include purpose/audience/session/consent isolation, foreign city/TODA/user/vehicle,
approval field injection, SQL privilege/RLS/FK/version failures, suspension,
expiry, revocation, stale assertions, global restrictions and actual closed
Redis/PostgreSQL transports. A measured PostgreSQL lock wait demonstrates a
concurrent downgrade waits for the eligibility read, followed by immediate denial.
Even a positive fixture cannot start a shift, collect GPS or receive offers.

Fresh/repeated/failed-transaction/down/reapply and populated rollback retain
earlier auth rows, ledger and unrelated sentinel. No existing database, Docker
volume or M1 infrastructure was reset or removed. Raw reports remain ignored in
`.cache/m2-driver/`; CI uploads only the safe `results.json`, never local keys.

No remote CI, Android/native secure storage, physical-device, Keycloak MFA,
live carrier delivery or production capacity pass is claimed. Gates A–E stay
closed. Owner review is required before M2.5; no publication is authorized.
