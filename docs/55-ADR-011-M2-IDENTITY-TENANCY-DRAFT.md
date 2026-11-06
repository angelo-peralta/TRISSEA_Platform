# ADR-011 — M2 identity, sessions and city/TODA tenancy

Date: 2026-11-05. Status: **ACCEPTED ARCHITECTURE / LOCAL DEVELOPMENT ONLY**.
Approval: explicit platform-owner M2 implementation directive in this session.
M2.0/M2.1 were authorized, followed by owner approval for M2.2, M2.3, M2.4 and M2.5;
current review stop before M2.6. Historical DRAFT filename is
retained for links. Production/legal/privacy gates are not approved.
Owners requested: platform owner, security owner, privacy owner and authorized
city/TODA verification-policy owners. Related unresolved decisions: D11, D13,
D16, D17 and M2-P01–P04 in [the register](43-DECISION-REGISTER.md).

## Context

The binding pilot uses one city operating tenant and multiple verified TODAs,
phone OTP for passengers/drivers and mandatory admin MFA. M1 provides an identity
interface and deny-by-default guard but no live identity/session/schema feature.
Its legacy reference SQL is not an approved M2 migration. The application needs
resource scoping, revocation and verification independent of vendor token claims.
The separate [SMS planning ADR](51-ADR-SMS-PROVIDER-AND-MOCK-OTP.md) is already
accepted for planning: PhilSMS candidate transport, server-generated/keyed-hash
OTP, Redis atomic consume and local/CI mock. This draft adopts that boundary and
does not authorize real sending or reopen that accepted planning choice.

## Accepted high-level decision (owner directive supersedes original proposal)

1. Keep NestJS/Fastify as a modular monolith over one PostgreSQL/Drizzle
   application database, PostGIS and Redis/BullMQ. SMS and Keycloak admin identity
   providers are external adapters, not TRISSEA microservice/database domains.
2. Use a minimal global `app_user`, separately mapped verified phone/admin identities,
   separate passenger/driver personas and explicit city memberships/TODA grants.
   Canonical `city_tenant_id` plus `toda_id` and composite constraints are approved.
   M1 `cityId` is a historical adapter vocabulary, not a new column name.
3. Implement TRISSEA OTP authority behind `OtpService` and a narrow `SmsGateway`:
   cryptorandom six digits, keyed hash only, five-minute configurable Redis
   expiry/attempt/single-consume and unique DB redemption. PhilSMS only transports
   the server-owned template. New mock transport runs locally/CI, never production.
4. Use app-issued mobile JWTs plus digest-only rotating refresh credentials,
   reviewed standard signing/key management and active DB session checks. Admin
   uses an opaque HttpOnly cookie; self-hosted Keycloak is the approved password/
   TOTP provider over OIDC Authorization Code + PKCE S256 with confidential BFF.
   Supabase is rejected. Passwords/TOTP seeds stay with Keycloak;
   application JWT keys use approved key management, not user tables/client code.
5. Resolve grants, ownership, duty/case, account restrictions and verification
   from current app DB state. No caller-selected role/scope, provider user metadata
   promotion or implicit platform-admin data bypass. Add narrow runtime SQL roles
   and reviewed RLS as defense in depth, not a replacement for API policy.
6. Driver authentication creates no operational authorization. Verification of
   identity, vehicle, TODA membership and permit/service area is separately
   versioned/audited under approved D16 policy. M2 does not enable dispatch or GPS.
7. Keep real identity-document collection gated until D17/D16 approval; synthetic
   fixtures cannot approve a live operator. Keep local OTP simulation out of
   deployed environments.

## Alternatives considered

| Alternative | Assessment for this proposal |
| --- | --- |
| Direct mobile operational writes using provider database credentials | Rejected by binding architecture and resource/state-machine requirements |
| All credential protocols implemented from scratch | Not proposed: SMS OTP/session authority follows accepted ADR using reviewed crypto libraries; delegate admin password/TOTP proof rather than invent their protocols |
| Managed provider owns passenger/driver SMS OTP | Superseded for this plan by the accepted SmsGateway/server-OTP boundary |
| Provider JWT alone, including role/custom metadata authority | Does not satisfy immediate app revocation, changing grants, verification or resource scope |
| App-owned opaque mobile access tokens for every client | Alternative to proposed app JWTs; changes the draft bearer-JWT contract and requires owner/security review |
| Per-TODA identity/database services | Conflicts with the approved modular-monolith foundation and complicates atomic authorization |

The proposed model retains app-owned OTP/session authority, transport portability
and a separate admin-proof adapter. DB revocation is authoritative. App key-cache
rotation and any external admin-factor/session revocation bounds must be tested;
an SMS acceptance/delivery status can never become proof of authentication.

## Consequences, approval scope and remaining conditions

- Add reviewed `0002_identity_foundation` (including sessions, OTP metadata,
  redemptions, consents, admin mapping and audit/outbox), with
  dedicated rollback/reapply and data-preservation tests. No legacy schema push.
- Extend identity interfaces, current principal resolution, typed MVP contracts
  and generated clients in separate M2 slices. M2.1 exposes no new HTTP endpoints;
  verification schemas remain M2.6. Preserve M1 migration checksums and ledger.
- Staff bootstrap/delegation, account linking/recovery, security values, key
  management and document retention need explicit owner decisions. Privileged
  fallback/default accounts are not an acceptable way to unblock development.
- Prove cross-city/TODA/owner/case denial and positive allowed fixtures. Prove
  session revocation, MFA/pre-auth boundaries and no unverified driver eligibility.
- Confirm PhilSMS PH delivery/cost/portability and approved endpoint/sender;
  test app signing/rotation/refresh/revocation and admin password/TOTP adapter
  behavior in an approved trial. Hosting,
  privacy/processor and storage selection remain conditional.

The owner directive grants architecture/local-development approval, not live SMS,
real documents, operational verification, recovery/delegation or deployment.
The original provisional Supabase proposal is superseded, with history retained
in doc 41 / D13 and the preserved planning checkout. No Supabase integration.
Exact boundaries, Keycloak realm requirements, scope vocabulary and remaining
conditions are in [M2.0 reconciliation](56-M2-ARCHITECTURE-AND-KEYCLOAK.md).
Detail is in [plan](52-M2-TECHNICAL-IMPLEMENTATION-PLAN.md),
[data/API design](53-M2-DATA-AND-API-DESIGN.md) and
[security/acceptance](54-M2-SECURITY-AND-ACCEPTANCE.md).

M2.3 local implementation selects pinned JOSE with Ed25519, five separate
application keys, authoritative PostgreSQL revocation and bounded original-request
refresh retries. [Doc 59](59-M2-PASSENGER-AUTHENTICATION.md) records exact interfaces,
migration 0004 and actual acceptance. This local selection does not approve
production key custody/rotation, security values, phone recycling or recovery.

M2.4 shares the OTP/session implementation while separating app purpose,
audience, consent and own-resource routes. Seven synthetic-only tables form the
pending driver intake and constrained eligibility handoff; they do not implement
M2.6 legal/document review. Dedicated non-owner locking and owner/purpose RLS
preserve current DB authority without runtime approval privileges. See doc 60.

M2.6 extends that boundary with synthetic-only versioned cases and reviewed
decisions. It reuses the approved role vocabulary and SAME application database,
with a separate non-owner connection and hardened NOLOGIN projection owner.
Assignment never substitutes for a scoped grant. Case approval creates no city
membership, staff role or permit assertion. Real evidence processing and reviewer
assignment/delegation procedures remain outside architecture approval. See doc 62.
