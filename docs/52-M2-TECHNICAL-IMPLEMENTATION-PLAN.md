# M2 technical implementation plan

Date: 2026-11-05. Status: **M2.0 architecture approved; M2.1 local implementation authorized. Review stop before M2.2.**

## Prerequisite and scope

Planning began only after M1 was committed/pushed and draft
[PR #1](https://github.com/angelo-peralta/TRISSEA_Platform/pull/1) existed. M1
submission: `3984620`; CI correction/head: `4249df0`. PR workflow
[41995024014](https://github.com/angelo-peralta/TRISSEA_Platform/actions/runs/41995024014)
passed Ubuntu, Windows and isolated infrastructure. M1 was subsequently merged at
`553c5d7011f6768f8323e898b23a381775ad9810`, verified against fetched `origin/main`.
The owner M2 directive authorizes M2.0/M2.1 locally, followed by a review stop.
It does not authorize publication, deployment, live SMS, real documents or recovery.

M2 covers identity adapters, passenger/driver SMS OTP, individual admin
email/password plus mandatory TOTP MFA, accounts/sessions, city/TODA resource
authorization, driver/vehicle/TODA verification and audit. Booking, fares,
operational shifts/dispatch, GPS, maps, cash processing and Reservation stay gated.

Binding sources: [AGENTS](../AGENTS.md), [pilot charter](34-TUGUEGARAO-PILOT-CHARTER.md),
[ADR-010](48-ADR-010-TUGUEGARAO-PILOT.md), [roles](37-ROLE-ACCESS-MATRIX.md),
[auth/privacy](41-AUTH-PRIVACY.md), [milestones](42-MVP-IMPLEMENTATION-GATES.md),
[decision register](43-DECISION-REGISTER.md), architecture/data-model docs 02/08,
and `contracts/openapi-mvp.yaml`. v1.5 overrides conflicting historical plans.
The additional [accepted SMS planning ADR](51-ADR-SMS-PROVIDER-AND-MOCK-OTP.md)
governs phone OTP instead of the older provisional managed-phone-auth proposal.
That independently supplied file is preserved unchanged; real sending remains unauthorized.

Companion designs:

- [Proposed tenancy/identity ADR](55-ADR-011-M2-IDENTITY-TENANCY-DRAFT.md).
- [Data, transactions and proposed API delta](53-M2-DATA-AND-API-DESIGN.md).
- [Threat controls, acceptance and approval gates](54-M2-SECURITY-AND-ACCEPTANCE.md).

## M1 baseline and remaining gap

M2.1 adds the isolated identity schema and storage boundaries described in doc 57.
The following describes the preserved M1 runtime; auth endpoints remain later slices.

M1 actually migrates only `foundation_metadata` and PostGIS. Historical
`database/001_core.sql` and `005_tuguegarao_pilot_REFERENCE.sql` are design inputs,
not installed identity/operational schemas. Do not execute or bulk-adopt them.

The API has a global deny-by-default guard, an `IdentityProvider` interface,
`DenyIdentityProvider`, scope/permission examples and a development-only in-memory
OTP test simulator. Only health has a runtime HTTP implementation. `/me` in the
MVP contract is a design placeholder returning an untyped object; there are no
implemented login, OTP, refresh, MFA or verification endpoints. Generated types
and the runtime client currently cover health, not working authentication.

## Proposed modular-monolith boundaries

| NestJS module | Owns | Explicit interfaces |
| --- | --- | --- |
| Identity | Server OTP generation/hash verification, app JWT validation, account linking; admin credential/MFA adapter | `IdentityProvider`, `OtpService`, `AdminCredentialProvider`; no client-selected role authority |
| SMS transport | Mock locally/CI; PhilSMS candidate behind live gate | Narrow `SmsGateway`; never a source of identity or sessions |
| Sessions | Session registry, mobile refresh coordination, admin browser session, revocation | `SessionService`, `PrincipalResolver` |
| Accounts | Minimal user profile, contact claims and consent versions | `AccountsService`; no passenger government-ID requirement |
| Tenancy | City tenants, verified TODAs, memberships, scoped grants | `MembershipService`, `AuthorizationPolicy` |
| Verification | Driver/vehicle cases, document references, review decisions, eligibility | `VerificationService`, `DriverEligibilityPolicy` |
| Audit / reliability | Append-only privileged events, outbox, reconciliation | Audit/outbox interfaces; workers may run separately from HTTP |

All application domains share PostgreSQL/Drizzle. NestJS/Fastify remains the API
boundary; no new microservices or per-module databases. Redis supplies atomic
ephemeral OTP consume/attempts/throttles as required by the accepted SMS ADR.
It never determines durable account, session, approval or grant truth.
PostgreSQL transactions commit session/grant/verification changes with
audit and durable event references. BullMQ may deliver/reconcile work; correctness
does not depend on an immediately successful queue publication.

## Provider and token design proposed for review

Adopt the accepted split: **TRISSEA owns OTP and sessions; PhilSMS is the initial
SMS transport candidate**. `SMS_PROVIDER=mock` is required locally and in CI.
Live transport additionally requires `SMS_LIVE_ENABLED=true`, approved credentials,
sender/account endpoint, privacy/budget review and carrier tests. Failure never
falls back to mock. Real sending/provider account provisioning is not authorized.
Dependency changes require the applicable slice's compatibility/security review.

Self-hosted **Keycloak** is the approved administrator email/password + mandatory
TOTP provider. Supabase is rejected. Its older provisional recommendation is
retained only as superseded history in doc 41 / D13; no integration is allowed.

Proposed baseline:

1. Nest creates cryptographically random six-digit OTPs with leading zeros and
   five-minute configurable expiry. Keep only a keyed hash; plaintext exists
   transiently for transport, never in HTTP responses, logs, outbox payloads or
   mobile persistent storage. Redis atomically controls attempts/single use;
   PostgreSQL records audit metadata and one accepted redemption.
2. After proof/DB completion, TRISSEA issues a short-lived app JWT and random
   opaque rotating refresh token. Store a refresh digest, except for a bounded
   encrypted lost-response envelope. Use a reviewed standard signing library and
   key-management adapter, not custom cryptography or embedded signing keys.
   Validate algorithm, exact environment issuer/audience, signature, expiry,
   not-before, subject and app session ID. External provider JWTs are not API tokens.
   A token alone is insufficient: the app DB must contain an allowed session/account.
3. Resolve application user, role/grants, verification and scope from PostgreSQL
   on each protected request. SMS receipts, provider metadata and requested app/role/city
   headers cannot create privileges. Preserve the existing `Principal` boundary,
   extending it with internal user/session IDs, client purpose and assurance.
4. Admin uses a same-origin Nest browser-session facade: opaque HttpOnly cookie,
   CSRF protection and encrypted server-side admin-provider proof/token storage if needed. Vite never
   receives Keycloak tokens or service credentials. Nest uses OIDC Authorization
   Code + PKCE S256 with a confidential client and server-only token exchange.
5. Ordinary admin-provider login operations do not use an administrative/service-role
   credential. Any invitation/revocation capability needing a privileged adapter
   is isolated, server-only, audited and separately approved. Clients never obtain
   database or storage administrative credentials.

The OTP/transport, global account/city-TODA model and Keycloak choice are now
approved for local development. Production key management, recovery and activation
remain gated; details are reconciled in doc 56. `SmsGateway` accepts only the server-owned OTP
template, canonical recipient and correlation metadata, and reports accepted,
rejected or unknown transport outcome. No contacts/campaign API, arbitrary relay
or auth logic belongs in it. Provider acceptance is not handset delivery or proof.

The [published legacy PhilSMS API](https://app.philsms.com/developers/documentation)
describes bearer-authenticated JSON sending. Verify the current account endpoint
and sender because the [current website](https://www.philsms.com/) links a different
dashboard host. Convert internal `+639...` to documented provider `639...` only in
the adapter. Never copy public example credentials or assume account OTP pricing,
VAT, segmentation or carrier/portability coverage. These remain activation gates.

## Passenger SMS OTP and account flow

1. Show phone entry and privacy purpose; normalize/validate Philippine mobile
   numbers on the server into `+63` E.164. No password or government ID is required.
2. Start a purpose-bound challenge after idempotency, destination/IP/budget
   throttles and provider-health checks. Return an opaque flow handle, masked
   destination, server expiry/cooldown and generic acknowledgement; never an OTP.
3. The user enters the code. Backend checks flow binding, attempts, expiry and
   current state before keyed-hash verification and atomic Redis consume.
   Exactly one DB completion may
   register an app session/account for the challenge.
4. Link by the server-verified contact/internal identity, or separately verified
   admin-provider issuer/subject where applicable, never
   by an unverified email or caller-selected account ID. Concurrent first logins
   converge through unique constraints. Phone recycling/change and account merges
   require their separate approved recovery policy.
5. A newly verified identity enters `CONSENT_REQUIRED` until the applicable notice
   and account terms versions are recorded. Only minimal onboarding/self/logout
   operations are allowed there. Optional email must not silently become a login
   credential or inherit staff access.
6. After consent, expose the account shell and authorized self-service context.
   M2 still exposes no live booking or fare quote. Reconnect fetches `/v1/me`; a
   cached token never substitutes for current server account/session status.

UI states: phone entry, sending, cooldown, code entry, verifying, expired, invalid,
attempts exhausted, provider/network failure, consent required, active, restricted,
session expired and signed out. Preserve the current design tokens, large text,
screen-reader names and 48 dp controls. Codes/phones never go in navigation URLs,
analytics or screenshots of real accounts. Do not auto-read contacts or request GPS.

## Driver SMS OTP and verification flow

Use the same proof mechanism with a separate driver-client purpose and session.
Authenticated and verified-for-work are independent states. A driver may sign in
and manage their own pending application while being unable to go online.

1. Create a pending driver profile after verified phone/required consent.
2. Request affiliation only with a city/TODA made available by an authorized
   city configuration. Selecting a TODA is a request, not a grant or approval.
3. Submit required identity/license, vehicle/MTOP/insurance evidence only under an
   approved D16 checklist and D17 document-processing policy. Until then, synthetic
   local fixtures only; real document collection remains disabled.
4. Assigned staff review within their actual permissions and jurisdiction.
   `VERIFICATION_OFFICER` with `driver.verify` handles restricted verification;
   a TODA manager's membership permission alone does not grant ID-document access.
   Nobody approves their own application or manufactures legal eligibility.
5. Identity, vehicle and TODA membership have separate pending/review/approved/
   rejected/suspended/revoked/expired outcomes. Resubmission creates a new evidence
   version; old decisions stay auditable. Record reviewer, policy/source version,
   reason, effective time and expiry where required by the approved policy.
6. Eligibility requires every applicable account, driver, vehicle, membership,
   TODA, permit and scope condition to hold. Unknown policy, missing/expired
   document or unapproved organization fails closed; capacity is never guessed.

M2 implements/test-drives **identity eligibility**, not a working driver shift.
The eligibility response distinguishes that result from operational availability:
even a synthetic fully verified driver has `canGoOnline=false` while M4/M5 gates
remain off. Tests must prove a positive identity-eligible fixture and specific
unverified denials, rather than treating an unimplemented shift route as proof.
Future shift/offer actions must call the same policy inside their transactions.

## Admin password and MFA flow

Admin accounts are individual and invitation/bootstrap controlled; no public
admin registration or selectable staff role.

1. Redirect to the isolated Keycloak realm using Authorization Code + PKCE S256,
   state, nonce, exact callback URI and confidential server credentials. The app
   does not accept/password-grant admin passwords or implement its own TOTP API.
2. Keycloak enforces invited identity, verified email where required, password and
   REQUIRED TOTP enrollment/execution; no password-only alternate browser flow.
3. Nest validates issuer, audience, signature/algorithm, expiry, nonce and subject,
   plus a realm-specific tested MFA assurance contract. No assumption that a
   generic `acr` or `amr` string alone proves current TOTP. Missing/removed/stale
   factor evidence or provider outage denies protected admin access.
4. Link exact issuer + verified subject via approved internal mapping, never by
   an unverified email or realm role. DB grants remain the only authorization source.
5. Rotate an opaque HttpOnly browser cookie after proof/current DB state. Enforce
   15-minute development idle timeout and 5-minute sensitive-action freshness.
   Refresh never advances authentication freshness.
6. No public registration, direct password grant, staff self-promotion, password
   reset, MFA reset/recovery codes, emergency access or account linking. Inspect
   and disable Keycloak built-in reset/account flows until Gate D is approved.

[Keycloak architecture/realm requirements](56-M2-ARCHITECTURE-AND-KEYCLOAK.md)
are implementation obligations for M2.5, not a claim of a running Keycloak service.

## Session lifecycle and client storage

- DB states: `PREAUTH`, `CONSENT_REQUIRED`, `ACTIVE`, `REVOKED`, `EXPIRED`.
  Store separate credential verification, MFA verification, activity and expiry
  timestamps. Purpose/client app is immutable for a session.
- Mobile app access JWT stays in memory; refresh/flow material uses SDK-compatible
  `expo-secure-store`. Rebuild both dev clients if adding that native module.
  Use app-specific storage keys and no shared passenger/driver credential store.
  Handle missing/unreadable secrets as sign-out, test backup/reinstall and
  biometric changes, and never restore trust solely from local storage.
- Admin cookie is host-only, Secure, HttpOnly and appropriately SameSite; use
  same-origin proxying, CSRF token + Origin checks on mutations and session
  rotation on login/step-up. Tokens are not stored in localStorage.
- Serialize app refresh on client/server with DB generation/consume checks. Permit
  only an approved same-request lost-response replay window, bound to session,
  client and proof with an encrypted short-lived outcome. Other stale-token reuse
  revokes the app family under approved policy. Test admin-provider refresh
  exceptions separately; they do not define TRISSEA's mobile token protocol.
- Logout/revoke commits the app deny state first, invalidates sensitive client
  caches and then reconciles any admin-provider revocation. The API rejects that app session
  immediately even if an app JWT has not expired. Out-of-band admin-provider
  revocation propagation has a measured/approved bound; no instantaneous guarantee
  is claimed without an introspection/event mechanism that proves it.
- Membership removal, suspension and staff role changes take effect from current
  DB state. A stale JWT or stale Redis cache cannot preserve an authorization.
  Multiple auth sessions do not permit multiple future driver engagements.

[SecureStore backup behavior](https://docs.expo.dev/versions/latest/sdk/securestore/)
and [Expo Router protected navigation](https://docs.expo.dev/router/advanced/protected/)
inform client behavior; server authorization remains mandatory.

## Proposed incremental delivery sequence

Each row becomes a separate reviewed feature branch/PR after explicit M2 approval.
Schema/API/tests/security effects accompany that slice; no batch schema generation.

| Slice | Work and dependency | Required exit evidence |
| --- | --- | --- |
| M2.0 | Approve ADR, provider/security policy, scope vocabulary; choose validated SDKs | Owners assigned; contracts and threat review; simulation/real-provider modes explicit |
| M2.1 | City/TODA/account/identity/session schema, repositories, constrained test fixtures | Fresh up/no-op/down/up on dedicated DB, constraints/RLS/connection-isolation tests |
| M2.2 | Deny-by-default principal/session resolution and resource policy | Wrong city/TODA, owner/case, missing MFA, stale grant and no implicit platform bypass tests |
| M2.3 | Passenger server OTP/MockSmsGateway/consent/app refresh/logout vertical | Keyed-hash/Redis consume and transport contract/concurrency tests; synthetic mobile end-to-end, no booking |
| M2.4 | Driver login and pending profile/membership request | Independent app session/storage; unverified driver cannot obtain eligibility |
| M2.5 | Invited admin password, TOTP, browser cookie/CSRF and reauth | Pre-auth bypass, MFA recovery/reset, CSRF and token-leak tests; admin UI evidence |
| M2.6 | Private evidence workflow, driver/vehicle/TODA scoped review | IDOR, unauthorized reads/self-review, expiry/suspension and optimistic-lock tests |
| M2.7 | End-to-end hardening, provider trial, privacy, documentation | Acceptance matrix in doc 54; actual SMS/provider results; owner signoff for the stated environment |

The initial administrator bootstrap must be reviewed before M2.5 can populate
staff grants. Local simulation fixtures never become live approvals. If M2.6 uses
synthetic documents while legal/privacy approval is pending, record that limitation
and keep the real upload/approval policy gate off.

## Implementation authorization and completion

The M1 merge, M2.0/M2.1 implementation, D11 tenancy model and Keycloak selection
are authorized by the owner directive. Production activation,
bootstrap/recovery rules, numeric security policy, document checklist and retention
all have named approval gates in doc 54/register. This plan does not approve them.
An approved local/CI phase uses a new mock SMS transport while exercising actual
random OTP/hash/session logic; it does not deploy the legacy fixed-code simulator.
That phase may proceed without activating a real provider; it
must not be reported as verified live SMS or production readiness. M2 acceptance
must state exactly which provider/environment/device gates were actually met.

M2.1 introduces only the reviewed identity foundation migration/repositories/tests.
Later auth, Keycloak infrastructure and verification slices remain unimplemented
until their review gates. No live messages or real identity provisioning is authorized.
