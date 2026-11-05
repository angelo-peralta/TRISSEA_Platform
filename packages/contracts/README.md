# Shared contracts

M1 implementation uses `../../contracts/openapi-mvp.yaml`. Run
`pnpm.cmd contracts:generate` and `pnpm.cmd contracts:check`; generated DTO and
operation types live in `src/generated/m1.ts`. Only `createHealthClient` has an
implemented runtime operation. Other MVP operation types remain future design.
The historical broad-contract note below is retained; v1.5 takes precedence.

`../../contracts/openapi.yaml` is the canonical initial API design. Generate shared TypeScript clients/types for Expo passenger/driver, React admin, and NestJS clients after contract review; do not hand-maintain divergent DTOs. Socket events require versioned JSON schemas. API remains authoritative on all state transitions.
