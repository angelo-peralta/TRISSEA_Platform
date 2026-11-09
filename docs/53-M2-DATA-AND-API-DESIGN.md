# M2 proposed data, transactions and API contracts

Status: **M2.0–M2.7 local/simulated engineering acceptance recorded. Identity/passenger/driver, Keycloak administrator and synthetic verification contracts are implemented; operational APIs remain disabled/future design. Final evidence and limits: [doc 63](63-M2-INTEGRATION-SECURITY-ACCEPTANCE.md).**
Read [accepted SMS planning ADR](51-ADR-SMS-PROVIDER-AND-MOCK-OTP.md),
[plan](52-M2-TECHNICAL-IMPLEMENTATION-PLAN.md),
[draft ADR](55-ADR-011-M2-IDENTITY-TENANCY-DRAFT.md) and
[security/acceptance](54-M2-SECURITY-AND-ACCEPTANCE.md). D11 was approved by the owner M2 directive for the city/TODA model;
legal/operational tenant approval is independent. Preserve legacy SQL reference files.

## Implemented M2.1 boundary

The actual 19-table schema is `identity.*` in
`services/api/src/database/identity-schema.ts` and migration
`0002_identity_foundation`; [doc 57](57-M2-IDENTITY-FOUNDATION.md) lists exact names,
SQL roles, encryption, constraints and execution evidence. The table below remains
the broader M2 design: browser token vault/retry envelopes, invitations and all
verification tables are deferred, not claimed installed. Actual assignment table
is `scoped_role_assignments`; personas and `otp_redemptions` are separate records.
No HTTP endpoint is added in M2.1.

## Proposed PostgreSQL/Drizzle model

All timestamps are `timestamptz`, persisted UTC; user-facing dates display PHT.
UUIDs are opaque identifiers, not authorization. Proposed canonical scope is
`city_tenant_id` / `cityTenantId` plus optional `toda_id` / `todaId`; explicitly map
historical `tenant_id` and the M1 example's `cityId` at module boundaries rather
than silently mixing them. No auth/verification feature introduces money or GPS.

| Table/group | Proposed fields and integrity | Privacy/access boundary |
| --- | --- | --- |
| `app_users` | UUID, lifecycle/consent state, minimal display profile, encrypted contacts, versioned contact lookup HMAC, verification times, restriction/version fields | Own-account reads; no mandatory passenger ID; provider passwords never stored here |
| `auth_identities` | User FK, PHONE_OTP/admin-provider kind, issuer + subject unique, verified-contact evidence, disabled time | App phone proof or external admin proof maps to one app user; linking requires proof; no email-string auto-merge |
| `city_tenants` | UUID/code unique, jurisdiction/timezone, status/policy evidence | One pilot city; no automatic live-operating approval |
| `toda_organizations` | City FK, city-scoped code unique, status/source/approval metadata | Pending by default; city plus TODA ID unique for composite references |
| `city_memberships` | User/city unique, status/effective/revoked times, version | Identity membership is distinct from staff permission and operating eligibility |
| `scoped_role_grants` / `role_permissions` | User, role, city, scope kind, optional TODA, effective/expiry/revoked/version; permission vocabulary from doc 37 | Check CITY→no TODA, TODA→required TODA; same grant must satisfy city/TODA/permission together |
| `app_sessions` | User/identity FK, app session UUID, optional external admin-session reference, immutable client app, auth stage, credential/MFA/activity/expiry/revocation times and reason, grant version | Active DB row required even for a valid app JWT; contact/token data not in list DTOs |
| `refresh_credentials` | Session/generation unique, random-token keyed digest, used/revoked/expiry time and replay linkage | Rotate atomically; raw refresh material only in client storage or bounded encrypted same-request outcome |
| `browser_session_secrets` | Session FK, cookie secret digest, CSRF digest, encrypted provider-token envelope/key version | Restricted auth repository; no plaintext tokens in ordinary queries or audit |
| `auth_challenges` | Random challenge ID, purpose/client, destination ciphertext + HMAC, binding-proof digest, lifecycle/expiry/cooldown, version and redemption receipt | DB audit/lifecycle metadata only; OTP keyed hash and atomic attempts/consume live in expiring Redis state; never restore/reset proof from a DB snapshot |
| `auth_request_results` | Flow/session + operation + idempotency digest unique, request hash, state, encrypted short-lived replay envelope/expiry | Credential-bearing retries require original flow proof; no bare idempotency-key lookup disclosure |
| `account_consents` | User, purpose/notice/terms versions, server time and withdrawal state | Notice acceptance and optional consent are distinct; legal basis text approved by privacy owner |
| `admin_invitations` | Opaque token digest, normalized email lookup, intended scoped grant request, expiry, inviter, accepted/revoked times | Invitation cannot grant privileges until approved bootstrap/grant policy and verified identity/MFA |
| `drivers` | User FK unique, profile status, verification case/version refs | Pending profile can authenticate; approval never inferred from role name |
| `vehicles` / `driver_vehicles` | City-scoped vehicle identity, evidence/approval/expiry, driver relationship and effective period | Verified document basis for capacity; no guessed seat count or unconstrained cross-city assignment |
| `toda_driver_memberships` | City/TODA/driver unique, status/source/reviewer/effective/expiry | Composite city/TODA FK prevents cross-city references; no client self-approval |
| `driver_tenant_authorizations` | Driver, city/TODA, approved permit/service-area references, effective/expiry/status | D16-approved authority; missing road/service policy is not permission to operate |
| `verification_cases` / `verification_decisions` | Subject/type, assigned city/TODA queue, evidence version, status/version, append-only reviewer/reason/time/policy decisions | Assignment and `driver.verify` required; self-review forbidden; no overwriting old decisions |
| `verification_documents` | Private object key/version, owner/case/scope, type, checksum, size, scan state, expiry, retention/legal-hold policy refs | No public URL, raw document number, plaintext image or signed URL in general DTOs/logs |
| `audit_events` / `outbox_events` | Immutable actor/session/scope/action/resource/version/outcome/reason/trace/time; durable delivery/reconciliation state | Identifier-only event references; no password/code/token/phone/ID image/GPS payloads |

Table names are a proposed review vocabulary, not a migration reservation. Split
storage by owned repositories/modules while retaining a single operational DB.
Keep optional admin identity-provider internal schema outside the app's migrations.
OTP is generated and verified by TRISSEA, never by the SMS gateway.

### Constraints, indexes and authorization

- Composite `(city_tenant_id, id)` unique keys support child composite FKs. A TODA
  reference must match its city; driver/vehicle/case links must match the subject's
  permitted jurisdiction. Validate relationships in the service and the database.
- Unique identity `(issuer, subject)` and normalized contact lookup constraints
  prevent duplicate first-login users. The exact global-phone/persona uniqueness
  and recycling/linking policy needs approval; no automatic account merge.
- Index active sessions by user/app session and optional admin-provider reference; index challenge lookup,
  expiry and destination digest; index cases by city/TODA/assignee/status; use
  effective/expiry indexes for grants and memberships. Do not index raw PII.
- Enforce allowed lifecycle values, required reason/reviewer for review decisions,
  positive approved seat capacity when present, monotonic versions and relational
  state consistency. Expiry is checked against DB time, not just cleanup jobs.
- `PLATFORM_ADMIN` is not an implicit cross-tenant data bypass. No union of a city
  from one grant with permission from another. Ownership, support-case assignment,
  staff duty, MFA and resource state are independent checks after identity.
- Separate migration owner from least-privilege runtime SQL role. Apply reviewed
  `USING` and `WITH CHECK` policies to sensitive city/TODA data as defense in depth;
  avoid owner/BYPASSRLS connections. Auth lookup gets a narrowly scoped identity
  context, not broad table access. Set server-derived context transaction-locally
  and prove pool reuse does not leak it. Never trust a caller scope header/GUC.
- PostgreSQL RLS can be bypassed by certain roles and does not cover every command;
  it does not replace repository scoping, constraints or API policy.
  [PostgreSQL 17 row-security documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
  is the implementation reference.

## Transaction and failure design

### Proposed role-to-operation mapping

This mapping refines doc 37 for review; it grants no runtime permission. New
permission names such as `verification.documents.read`, `toda.verify` and
`identity.grants.request/approve` require owner/security approval under M2-P04.

| Actor | M2 allowed boundary | Explicit denial |
| --- | --- | --- |
| Passenger | Own profile, required consent and own sessions after phone proof | Another account, staff role selection, driver approvals and KYC access |
| Driver | Own pending profile, vehicle/evidence and membership requests; own case status | Self-verification, self-approved capacity/TODA, another driver's documents or operational online action |
| TODA manager | Authorized organization's masked onboarding/membership work with `toda.members.manage` | Other TODA/city, legal identity approval or document access merely by being manager |
| TODA dispatcher | Only explicitly approved masked roster/read context | Identity approval, KYC, city-wide search or active dispatch features in M2 |
| Verification officer | Assigned city/TODA case, `driver.verify` and separately approved document-read permission with MFA/reauth | Own case, foreign/unassigned case, fare change or routine GPS access |
| City operations admin | City organization/policy administration allowed by approved permission/evidence | Implicit document decrypt, other city or undocumented legal/operator approval |
| Fare editor/approver | Staff identity and scoped role metadata only in M2 | Actual fare mutations remain M3; role combinations never waive maker/checker rules |
| Support agent | Own account and approved case-bound masked support context | KYC, bulk identity export, GPS or unrestricted cross-TODA search |
| Privacy officer / security auditor | Purpose-bound privacy procedures / metadata-only security review respectively | Routine privileged data access or identity decisions inferred from the role label |
| Platform admin | Explicit infrastructure duties and narrowly approved provisioning | Automatic city/TODA/PII superuser; staff-grant authority without the M2-P02 procedure |

No published route accepts an `admin=true` or `permission[]` input as authority.
List queries must apply the same policy as individual resource reads. Role grant
requests/decisions remain disabled until the responsible grant authority and
conflict/recovery procedure are approved; infrastructure access is not that approval.

### Atomic operations and recovery

| Operation | Required DB behavior | External failure/recovery |
| --- | --- | --- |
| Request OTP | DB challenge/audit preparation + shared Redis quota reservation/keyed hash with TTL; do not send until both authorities are available | Plaintext code is transient only; send synchronously through transport outside DB locks; ambiguous ACK is not blindly retried; new send after cooldown invalidates the prior challenge |
| Verify OTP | Atomic Redis attempt/expiry/single-consume, then one DB redemption/account/session/audit completion | Consumed proof has a bound non-code redemption receipt for safe DB retry; unique receipt constraint stops duplicate sessions; Redis loss cannot resurrect a hash or reset attempts |
| Verify MFA | Consume purpose-bound challenge once; rotate pre-auth→full browser session and audit | Provider failure/expired proof cannot create admin access; stale factor state fails its assurance gate |
| Refresh | Single-flight and DB compare-and-swap of app refresh-token generation/digest; consume once | Same-request/client lost-response outcome has approved encrypted expiry; other stale reuse revokes app family; optional admin-provider refresh tested separately |
| Logout/revoke/suspend | Commit deny/revoked state and audit/outbox together | Provider/Redis failure cannot undo DB denial; retry external cleanup with deduplication |
| Verification/membership decision | Re-read current session/grant, subject scope, case version and evidence under lock; write decision + version + audit/outbox once | Conflicting review returns 409; suspension/revocation races have one serialized result, not stale approval |
| Privileged document read | Verify assigned scope, MFA/reauth and purpose; commit access audit before delivery | Storage timeout cannot grant broader access; audit URL issuance/read outcome without URL/token content |

SMS transport, Redis and PostgreSQL are not a distributed transaction. Maintain explicit
`REQUESTED/SENDING/VERIFYING/COMPLETED/FAILED/UNKNOWN/EXPIRED` checkpoints as applicable,
bounded leases and reconciliation. Do not promise exactly-once external SMS when
the vendor lacks idempotency. At-most-one accepted app completion is mandatory.
After irrecoverable proof/receipt loss, request fresh OTP rather than guessing
success. Outbox consumers are idempotent and have retry/dead-letter
visibility; their payload references cannot disclose credentials/documents.

### Keyed OTP state and failure recovery

Generate six digits with an unbiased cryptographically secure library primitive;
store only a versioned HMAC binding code, challenge, phone digest, client and
purpose. A plain six-digit-code SHA hash is insufficient against offline guessing.
The key belongs in approved secret management and is not a frontend/API value.
Expiry is five minutes per the accepted SMS ADR, with approved configurable policy.

Use a reviewed Redis atomic script/version protocol to increment attempts and
consume valid proof once. Keyed-hash comparison is constant-time in the trusted
service; an expected-version/atomic consume prevents races between that comparison
and a resend or competing verification. Invalid guesses cannot delete an otherwise
valid challenge unless its attempt limit is reached. All API instances share this
state; topology/key-slot assumptions must be tested before Redis clustering.

Successful consume produces a short-lived, purpose/client/idempotency-bound
redemption receipt containing no code. The unique DB redemption may be retried
only with that original binding if the process/DB fails before session completion.
If Redis/receipt state is lost, fail closed and require a new challenge; never
rebuild counters/hash from stale DB audit data. DB/Redis unavailable means no new
send or session. Durable DB session/grant/verification truth remains authoritative.

Do not persist the recoverable OTP in an SMS outbox, even encrypted. The new mock
transport captures it only in an isolated in-process/IPC test harness, never a
public retrieval endpoint. The legacy M1 fixed-code simulator is not the M2 core.
After an ambiguous transport timeout, retain UNKNOWN delivery metadata, allow
valid proof if the user received the still-current code, and offer explicit
cooldown resend otherwise. Transport acceptance never changes identity status.

The PhilSMS adapter contract is restricted to the documented legacy send shape:
HTTPS POST with server-only bearer credential and JSON `recipient`, `sender_id`,
`type: plain`, `message`. The account's current endpoint, registered sender,
segmentation/rate/billing and delivery callback authenticity must be confirmed
before live activation. Use a stub HTTP client for contract tests; no production
API call or contact/campaign feature is needed to verify payload construction.

## Migration strategy - M2.1 local/disposable only

1. Approve ADR-011, scope vocabulary, identity uniqueness and sensitive-data policy.
   Review each Drizzle schema delta and corresponding handwritten/reviewed SQL.
2. Implemented M2.1 `0002_identity_foundation`: city/TODA/account/identity/grant/consent core,
   reviewed static role definitions and restricted SQL roles/policies. No real
   administrator, verified organization or approved operator seed.
3. The owner includes sessions, refresh digests, OTP metadata/redemptions, consent,
   admin identity mapping and audit/outbox in `0002_identity_foundation`. Browser
   token vaults and bounded credential-bearing retry envelopes remain a reviewed
   later auth-slice migration. They are not needed to expose a safe M2.1 schema.
4. M2.2 adds `0003_authorization`: conservative role-permission edges, metadata-only
   SQL resolver roles/RLS and a hardened policy-row-lock function, with no new tables.
   Later auth/vault/verification migrations take the next available reviewed IDs
   in their slices. No real document storage before D16/D17 approval.
5. Each migration gets checksum/order checks, transactional up/down, fresh and
   repeat apply, dedicated rollback/reapply and unrelated-table preservation
   tests. Reuse the local runner; no Drizzle `push`, legacy seed execution or
   production DDL. Destructive down is permitted only for a named disposable
   test DB; populated deployments use an approved forward-repair plan.
6. Data export, contact-HMAC/key rotation and retention/legal-hold behavior need
   independent migration/recovery tests. No blanket cascade may delete immutable
   audit history or another city/TODA's records.

## Proposed OpenAPI delta

Admin credential/TOTP screens belong to Keycloak. Earlier proposed app-managed
MFA/password-reset routes are superseded by OIDC login/callback; recovery remains
disabled by Gate D. No new HTTP endpoint is implemented in M2.1.

All routes below are **proposals under `/v1`**, not current implementations.
Extend `contracts/openapi-mvp.yaml`; leave broad `openapi.yaml` intact. Add explicit
operation IDs, request/response/error schemas, headers, auth stage and permission
requirements. The current generator rejects composition keywords and generates a
health-only runtime client. Extend it with meaningful tests before depending on
new schema vocabulary, typed headers/cookies or additional runtime clients.

| Method/path | Actor / success | Required behavior |
| --- | --- | --- |
| POST `/auth/phone/challenges` | Anonymous bounded flow / 202 `PhoneChallenge` | Body phone + PASSENGER/DRIVER client purpose + binding nonce; idempotency; uniform acknowledgement; no role/city grant |
| POST `/auth/phone/challenges/{id}/verify` | Bound flow / 200 `MobileAuthResult` or 202 processing | Body code + flow proof; one completion; consent stage/active session only after verified proof |
| GET `/auth/phone/challenges/{id}` | Bound flow header / 200 `ChallengeStatus` | Minimal pending/expiry/cooldown; never reveal account existence or return credentials |
| GET `/auth/admin/login` | Anonymous bounded browser flow / 302 | Keycloak OIDC Authorization Code + PKCE S256; no app password endpoint |
| GET `/auth/admin/callback` | Bound OIDC callback / 302 | State/nonce/code exchange + verified MFA/subject mapping; opaque app cookie only |
| GET `/auth/admin/reauthenticate` | Bound admin OIDC flow / 302 | Fresh Keycloak password/TOTP proof; token refresh is not reauthentication |
| POST `/auth/mobile/refresh` | Mobile app refresh proof / 200 `MobileAuthResult` | Atomic app-token rotation, current session/client binding, approved retry/replay handling |
| POST `/auth/browser/refresh` | Admin cookie + CSRF / 200 `AdminSessionState` | Server-only provider material; no token JSON to the SPA |
| POST `/auth/logout` | Current session / 204 | Idempotent local revocation first; clear client material; remote cleanup reconciled |
| GET `/auth/sessions` | Own account / 200 masked `SessionList` | No refresh tokens, raw fingerprints or cross-user list |
| POST `/auth/sessions/{id}/revoke` | Owner or explicitly authorized/reauthed staff / 204 | Ownership/resource scope and reason where privileged; no cross-tenant arbitrary revoke |
| GET/PATCH `/me` | Appropriate active/onboarding session / 200 `Me` | Typed lifecycle, allowed context, masked contacts; allowlisted mutable profile fields only |
| POST `/me/consents` | Verified onboarding/active identity / 201 | Versioned purpose/notice terms; idempotency; no blanket optional consent |
| POST `/driver/profile` | Verified driver-purpose user / 201 pending profile | No status, reviewer, permit or role mass assignment |
| GET `/driver/me/verification` | Driver self / 200 own case summaries | Mask restricted evidence fields; no provider/storage keys |
| GET `/driver/me/eligibility` | Driver self / 200 `DriverEligibility` | Identity eligibility separate from disabled operational `canGoOnline` |
| POST `/driver/me/memberships` | Driver self / 201 pending request | City/TODA existence and scope; selecting a TODA never verifies membership |
| POST `/driver/me/vehicles` | Driver self / 201 pending relationship | City-bound, versioned evidence; no approved capacity default |
| POST `/verification/documents/upload-intents` | Subject/authorized staff / 201 `UploadIntent` | Case/owner scope, type/size limits, private key-bound short upload URL; gated real-data policy |
| POST `/verification/documents/{id}/complete` | Same uploader/context / 202 | Verify object checksum/type/size; quarantined until scan succeeds |
| POST `/verification/cases/{id}/submit` | Owner/authorized staff / 202 | Evidence version complete; duplicate submission idempotent |
| GET `/admin/verifications` | Assigned scoped reviewer / 200 `CasePage` | Permission-filtered, bounded cursor pagination; not a bulk PII search |
| GET `/admin/verifications/{id}` | Assigned reviewer + MFA / 200 masked detail | Ownership, city/TODA and duty checked from DB |
| POST `/admin/verifications/{id}/decisions` | `driver.verify` + MFA/reauth / 201 decision | Reason, expected version, policy/evidence version and no self-review |
| GET `/admin/verification-documents/{id}/content` | Explicit document-read authority + recent reauth | Audited authenticated stream; not a reusable public document link |
| POST `/admin/todas` and `/admin/todas/{id}/decisions` | Authorized city context / pending creation or decision | Approved role/organization policy; no self-authorized legal operation |
| POST `/admin/todas/{id}/memberships/{memberId}/decisions` | Scoped membership-management authority / decision | Cannot substitute for separate identity/vehicle verification |
| POST `/admin/role-grant-requests` and `/admin/role-grant-requests/{id}/decisions` | Approved security-owner workflow + MFA/reauth | Disabled until bootstrap/delegation policy approved; no implicit platform superuser |

Phone/contact change, MFA recovery/reset and account-linking routes require the
approved recovery policy before their contract is activated. Until then expose a
clear unavailable/support outcome; do not add an SMS fallback for admin MFA.
Document final endpoint naming/operation IDs in the review ticket before code.

### DTO and transport requirements

The proposed app JWT contains exact environment issuer, allowlisted mobile
audience, internal user `sub`, app `sid`, random `jti` and UTC `iat/nbf/exp`.
No phone, email, ID document or authorization-grant array belongs in it. Resolve
stage/MFA/grants from current DB/proof state. A reviewed asymmetric algorithm and
`kid`/key-rotation policy are required; never follow token-provided key URLs or
accept unsigned/foreign-provider JWTs as application access tokens. Separate
admin-provider proof verification remains internal to its adapter.

| DTO | Required information / exclusions |
| --- | --- |
| `PhoneChallenge` | Random handle, masked destination, UTC expiry/resend time, flow binding; no phone/code echo |
| `MobileAuthResult` | Discriminated stage, app session handle, app-issued JWT/opaque refresh material for mobile only, expiry, minimal self context; no staff grant from input |
| `AdminPreauthResult` / `AdminSessionState` | Required stage, allowed next step, expiry and CSRF metadata; cookie is HttpOnly; no provider tokens in JSON |
| `Me` | Internal user ID, state, masked contacts, consent requirements, verified client purpose and explicit authorized scope summaries |
| `ScopeGrant` | City tenant, optional TODA, role/permission, effective/expiry, scope kind; ownership/case decisions still server-side |
| `DriverEligibility` | Profile/vehicle/membership policy versions, identity eligibility, blocked reason codes, `operationalServicesEnabled=false`, `canGoOnline=false` in M2 |
| `VerificationDecision` | Subject/case, expected version, evidence/policy version, decision, reason; reviewer/time taken from server |
| `UploadIntent` | Restricted opaque document ID, short upload capability/expiry and constraints; credential-bearing response is no-store and never logged |
| `Error` | Stable code, safe message, trace ID and retry metadata; no raw provider exception, SQL detail, subject existence or PII |

Use `Cache-Control: no-store` on auth/document responses. Add a reviewed browser
cookie scheme alongside bearer auth; reject ambiguous/mixed credential contexts.
CSRF/Origin checks apply to cookie-authenticated mutations. Verify all requests at
runtime against reviewed schemas; reject unknown security-sensitive fields.

Use `Idempotency-Key` (existing 12–128-character contract bounds) on auth flow
mutations including OTP/login/MFA/refresh, driver/membership/document submissions
and privileged decisions.
Bind keys to actor/flow, operation and canonical request hash; changed payload
under one key is 409. Credentials in retry envelopes are encrypted and available
only with the original bound proof, with approved short expiry. Never cache raw
secret responses in Redis/outbox logs.

Common outcomes: 400 malformed input; generic 401 invalid/expired proof; 403
authenticated policy denial; masked 404 for inaccessible resources; 409 stale
version/idempotency conflict; 422 incomplete allowed-domain submission; 429 with
server `Retry-After`; 503 unavailable provider/DB/abuse controls. Anonymous auth
errors must not encode whether a user exists, is restricted or has staff roles.
An accepted send request is not a claim that an SMS was delivered.

## M2.3 implemented contract reconciliation — 2026-11-06

The exact ten implemented passenger operations and four new tables are recorded
in [doc 59](59-M2-PASSENGER-AUTHENTICATION.md) and MVP OpenAPI v0.6.0. Earlier
tables above describe proposed future DTOs. The implemented challenge returns
no destination echo; the credential result has no stale stage claim. Clients
obtain authoritative consent stage from `/me` after login/refresh. No staff grant
or phone is in the JWT/profile. Challenge status requires secret device/proof
headers; verification resubmits the phone and original binding. `clientPurpose`
is PASSENGER only. All mutation contracts require Idempotency-Key; same-request
verify/refresh response recovery is encrypted and bound for 15 seconds.

PostgreSQL budgets survive Redis loss; consumed proof is never reconstructed from
database metadata. Redis is atomic transient proof, PostgreSQL is authoritative
redemption/session state. Session proof uses Ed25519 JOSE and opaque 48-byte
rotating refresh credentials. Local absolute sessions last at most 24 hours;
production policy/key rotation remain review gates. Error 429 provides a 60-second
advisory Retry-After minimum, not a guarantee that an hourly/daily budget is free.

## M2.4 implemented contract reconciliation

MVP v0.7.0 extends the four shared phone/status/refresh operations to an explicitly
validated DRIVER purpose and adds eleven own-driver intake/session/status routes.
Existing operation IDs remain stable; `x-driver-operation-id` aliases generate
the separate driver transport. Status defaults to PASSENGER for compatibility;
the driver transport supplies the DRIVER header. Protected endpoints derive
purpose only from cryptographic proof and current sessions, never that header.
Both generated clients narrow request/response purpose and persist nothing.

0005 adds seven constrained synthetic driver tables listed in
[doc 60](60-M2-DRIVER-AUTHENTICATION.md), plus a dedicated non-owner lock function.
The new assertions are a test-only identity-eligibility handoff; full verification
cases/evidence/decisions remain M2.6. Scoped composite FKs, owner/purpose RLS,
immutable bindings and column grants prevent runtime self-approval. Synthetic
intake configuration is owner-provisioned; requesting affiliation grants neither
city membership nor a staff role. Every eligibility result keeps operational and
real-driver approval false, even for positive synthetic fixtures. M2 always denies
the existing future shift/location/offer routes; no operational success is claimed.

## M2.5 implemented contract reconciliation

MVP v0.8.0 implements POST `/admin/auth/login`, GET `/admin/auth/callback`,
GET `/admin/auth/session`, POST `/admin/auth/logout` and read-only
GET `/admin/access/todas/{todaId}`. These supersede proposed `/auth/admin/*` and
browser-refresh paths above. Reauthentication uses the same fresh password/TOTP
flow; provider refresh is disabled. Cookie-based operations have an explicit
security scheme; mobile bearer credentials cannot substitute for them. Generated
backend/shared DTOs match the contract. The Vite integration keeps CSRF only in
memory; provider tokens never leave the BFF.

0006 adds two private authentication-boundary tables, admin_oidc_flows and
admin_browser_sessions, and a non-owner role/locking function. It preserves the
0001–0005 ledger. Initial unauthenticated credential lookup requires auth-boundary
metadata access; app authorization uses the existing current-user/city/TODA RLS
and locked transactions. Keyed digests index encrypted flow/provider material;
there are no plaintext contact or provider-token indexes. Separate Keycloak
PostgreSQL ownership never grants access to these application tables.
Exact schema/migration/cookie/realm boundaries are in [doc 61](61-M2-KEYCLOAK-ADMIN.md).

## M2.6 synthetic verification implementation

Migration 0007 adds seven verification-domain tables for evidence heads/versions,
cases, submissions, assignments, decisions and encrypted request receipts. All
bindings carry `city_tenant_id`, `toda_id` and the owned relationship; composite
foreign keys prevent cross-scope references. Immutable rounds preserve evidence
and decision history. Deferred SQL constraint triggers enforce current pointers.
The restricted projection function updates only synthetic driver facts and writes
the decision audit/outbox atomically. Runtime credentials cannot approve directly.

OpenAPI v0.9.0 adds five owner-only DRIVER routes and six assigned reviewer routes.
Driver selectors cannot include status, permits, documents or reviewer identity.
Review commands require expected case/evidence versions, cookie, exact Origin,
CSRF and an idempotency key. OFFICER and TODA_MANAGER routes remain separate.
Cursor lists and bounded recent history prevent unbounded reads. No upload,
assignment/delegation, personal-document or operating-permit endpoint exists.
See [doc 62](62-M2-SYNTHETIC-VERIFICATION.md) for the state machine, evidence
invalidation, isolated reproduction and actual acceptance status.

## M2.7 client integration

Local/simulated engineering acceptance is complete; actual native, HTTP, browser,
preservation and security results are recorded in [doc 63](63-M2-INTEGRATION-SECURITY-ACCEPTANCE.md).
No M2.7 endpoint, schema or operational migration was introduced. External policy
and production gates remain closed.

No schema, migration or public endpoint was added. Both native applications use
the generated purpose-bound SDK over the implemented contracts above. A shared
controller keeps access JWT/profile data in memory and only device/proof/rotating
refresh metadata in native secure storage, with separate package/keychain scopes.
Cold restore requires current server validation; background state hides identity;
logout intent survives process death. Unknown refresh outcomes can be retried
only with the persisted original key inside the existing server retry window;
older ambiguous outcomes clear local credentials and require sign-in. Clearing
an uncertain local credential is not a claim that its remote session was revoked.

The React/Vite review panel uses existing assigned-case endpoints, current cookie
session, Origin/CSRF and case/evidence versions. Unknown decision responses retain
the exact original key/body for bounded server idempotency; changed versions
require inspection again. No client can provision a reviewer, evidence, grant or
permit. Test fixtures and mock-message capture use private parent/child IPC only,
never an API endpoint. See [doc 63](63-M2-INTEGRATION-SECURITY-ACCEPTANCE.md).


### Verification target version correction

Migration 0008 adds internal `verification_projection_versions` metadata with
one foreign-key-bound projection count per target. Evidence snapshots use the
general row version minus guarded projection count; general optimistic/eligibility
versions remain unchanged. This preserves independent sibling approvals without
ignoring genuine target, policy or evidence changes. No public field or endpoint
changes. See the [review fix and migration boundaries](62-M2-SYNTHETIC-VERIFICATION.md#review-fix---independent-sibling-approvals-2026-11-09).
