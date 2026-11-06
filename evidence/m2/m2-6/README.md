# M2.6 local synthetic acceptance — 2026-11-06

The observed command exits, 115 repository tests and 80 integration tests are in
`validation.json`. Six fresh regression reports preserve their execution times,
disposable database names, checks and results. `verification-results.json` records
the combined application's 12 case/migration/authorization/concurrency checks.

`security-summary.json` records zero moderate/high/critical findings and one low
deepmerge advisory. The low-threshold detail command exits 1 because that finding
remains; the mandatory moderate-threshold command exits 0. No dependency upgrades.

The two reviewer screenshots show real local Keycloak sign-in/TOTP with input and
username masking. `admin-regression/` contains fresh actual Playwright sign-in,
TOTP, desktop/mobile dashboard and error-state evidence. No credentials, codes,
personal documents, database exports, APKs or raw logs are included.

These are local browser/API/database results, not physical-device, live SMS or
production acceptance. No new verification UI is claimed. Gates A–E stay closed;
M2.7 requires owner review approval. See `docs/62-M2-SYNTHETIC-VERIFICATION.md`.
