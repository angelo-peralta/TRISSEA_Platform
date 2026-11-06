# M2 security, testing and acceptance plan

Status: **M2.0 architecture approved; M2.1–M2.4 local backend acceptance recorded. Native integration, production and external gates pending.**
Companions: [technical plan](52-M2-TECHNICAL-IMPLEMENTATION-PLAN.md),
[data/API design](53-M2-DATA-AND-API-DESIGN.md),
[draft ADR](55-ADR-011-M2-IDENTITY-TENANCY-DRAFT.md).
Phone OTP follows the [accepted SMS planning ADR](51-ADR-SMS-PROVIDER-AND-MOCK-OTP.md):
TRISSEA-generated code/keyed hash and Redis consume, with mock transport in local
development/CI. PhilSMS is a candidate transport, not an identity provider.

## Trust boundaries and controls

| Threat | Planned control | Proof required |
| --- | --- | --- |
| OTP enumeration, guessing or SMS spending abuse | Uniform anonymous responses; bound challenge; destination/IP/client and provider throttles; approved spend cap; attempts/expiry from DB time | Existing/nonexisting/restricted destinations indistinguishable; concurrent limits enforced across instances; budget exhaustion blocks sends |
| OTP reuse/racing verification | Keyed hash, atomic Redis attempt/version/consume and one DB redemption/session transaction; bound non-code retry receipt | Concurrent verifies create at most one app completion; expired/consumed proof cannot create another session; Redis restart cannot reset guesses or resurrect proof |
| SIM swap/recycled phone / unsafe account linking | Separate contact-change/recovery workflow, fresh proof and security review; no unverified email or phone-string merge | Attacker cannot claim staff/driver approvals by changing a phone or matching a contact |
| Forged/stale JWT or key confusion | TRISSEA signing/validation adapter, fixed app issuer/keys, algorithm/audience/expiry/not-before checks, safe rotation, live DB gate | External-provider JWT cannot be used as app bearer; wrong claims/algorithm/kid, unsigned/malformed/expired token or revoked session denied; token key URLs ignored |
| MFA bypass | Restricted pre-auth allowlist, provider-verified assurance, DB session state, current factor/reconciliation check and recent reauth for privileged actions | Direct admin endpoint, stale AAL2 after factor removal, refresh-as-reauth and client `mfa=true` attempts fail |
| Stolen/rotating refresh credential | Random app refresh token with keyed digest, DB generation CAS, secure client storage, single-flight and bound request/session/client | Only approved same-request lost-response retry succeeds; other stale reuse revokes/alerts; no cross-client adoption; optional admin-provider refresh tested separately |
| Browser CSRF/XSS/session fixation | Same-origin admin facade; Secure HttpOnly host cookie; CSRF and Origin checks; CSP; no admin tokens in JS/localStorage; rotate session on assurance change | Foreign/absent/mismatched CSRF, hostile Origin, mixed cookie/bearer context and attacker-chosen session ID denied |
| Cross-city/TODA IDOR / mass assignment | Server-loaded resource scope, composite FKs, same-grant permission check, least-privilege SQL/RLS; request DTO allowlist | All read/write/list/export paths tested with wrong IDs/scopes; body role/status/reviewer/city overrides rejected |
| Verification self-approval, stale decisions, unsafe uploads | Assigned reviewer + explicit permission + MFA/reauth, evidence/version locks; private quarantine/scan | Self-review and unassigned reviewer denied; concurrent decision only once; malicious/type/size/checksum failure cannot become approved |
| Missing privacy policy or data exfiltration | Real-document feature disabled until policy approval; minimal encrypted PII; audited restricted access; bounded approved retention/export | No public object access; signed URL/ID/phone/OTP/token absent from logs/screenshots; unaudited privileged read fails |
| Redis/IdP/DB outages | Fail closed for new auth and privileged actions when required authority is unavailable; DB revocation precedes external cleanup | No successful mutation inferred from timeout; no permissive mock fallback; durable unknown/retry/reconcile state |
| Privilege retained after restriction | DB account/session/grant/approval versions checked in the mutation transaction | Suspension vs approval/eligibility races serialize; stale token/cache cannot override current denial |

OWASP recommends generic authentication responses to reduce enumeration; apply
that to response bodies, status behavior and measurable timing differences.
[Authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
also informs throttling and reauthentication. These controls are a proposed
TRISSEA design, not a claim of penetration-test or legal certification.

## OTP baseline and proposed configurable security controls

Six-digit server-generated OTP and five-minute configurable expiry are already
accepted for planning by the SMS ADR. The owner directive adopts the listed OTP limits, 10-minute mobile JWT,
15-minute admin idle and 5-minute sensitive-action freshness as development settings.
Other numeric controls below remain review candidates. Owners must approve/test real activation configuration. Nothing here
is installed by this plan or presented as a vendor default.

| Control | Candidate for review | Unresolved/activation rule |
| --- | --- | --- |
| Phone challenge | Adopt 6 cryptorandom digits and 5 minute expiry; propose 60 second resend floor and 5 attempts | Redis authoritative consume/expiry, DB redemption uniqueness; additional rate settings reviewed before live activation |
| Destination abuse budget | Initial trial candidate 5 sends/hour and 10/day; shared-NAT IP budget separately calibrated | Security/SMS owner validates legitimate access, fraud and cost; no permanent account lock from unauthenticated requests |
| JWT / app session | App JWT lifetime 10 minutes in development; DB idle/absolute limits independently enforced | No unlimited lifetime; production limits require security review |
| Admin lifecycle | Candidate idle 15 minutes, absolute 8 hours, sensitive-action reauth within 5 minutes | Refresh does not advance credential/step-up proof time; no public recovery until approved |
| Password | Candidate at least 12 characters, maximum at least 128, password-manager/paste support and compromised-password screening | Provider/security configuration and Unicode behavior tested; no custom password hashing or arbitrary composition rules |
| Document access/upload | Read stream after authenticated authorization; short upload URL candidate 60 seconds with one object/type/size/checksum constraints | D16/D17 must define supported documents, size limits, legal basis and retention before real upload |
| Retry secrets / challenge cleanup | Short encrypted outcome window; no plaintext token cache; cleanup periods tied to approved data categories | Set actual TTL/key-management policy after provider lost-response tests; do not store indefinitely |
| Signing keys and out-of-band revocation | Exact issuer/algorithm allowlist, emergency key-cache purge and measured revocation/assurance propagation | Vendor cache/introspection limits recorded; DB-initiated app revocation is immediate, vendor-only changes require a proven/approved bound |

TRISSEA owns mobile refresh rotation and its approved same-request retry policy.
Do not copy vendor reuse rules into it. If a managed admin adapter needs refresh,
test Keycloak refresh and assurance lifecycle separately; they do not define
TRISSEA mobile-token semantics. Supabase is rejected by the owner directive.

## Privacy and operational readiness

- Keep live SMS, admin-provider auth, document collection and verification decisions under
  explicit environment/capability gates. A production process configured for the
  local simulator must fail startup. No default credential or fixed OTP endpoint.
- Build a new `MockSmsGateway` transport for local/CI use with actual random OTP,
  keyed hashing, Redis limits and DB session logic. Its test-only in-process/IPC
  capture is not a public OTP retrieval route. Legacy M1 `DevelopmentOtp` stays
  isolated dev/test code and is not reused as the M2 deployed identity system.
- Require `SMS_PROVIDER=mock` and live sending off in CI; reject mock in production.
  A real adapter additionally needs explicit `SMS_LIVE_ENABLED=true` plus approval,
  valid sender/endpoint/credentials and spend limits. Unset/unreachable/unapproved/
  exhausted real transport fails closed; never silently substitute mock or skip OTP.
- Place server secrets in approved secret management. Encrypt contact fields,
  document storage, token vaults and backups; use distinct keys/rotation purposes
  for encryption and contact lookup HMAC. Exclude secrets from `EXPO_PUBLIC_*`,
  Vite public variables, error output, telemetry and CI artifacts.
- Access only authorized verification evidence. Store private object references;
  use scoped short upload capabilities and authenticated audited reads. Do not
  claim a reusable storage signed URL is inherently single-use or user-bound.
- Audit identity/security/grant/verification decisions and privileged reads with
  actor/session/scope/resource/reason/outcome/trace, while excluding raw contact,
  password, code, token, document or precise-location data. No GPS is collected in M2.
- DPO/privacy owners approve notice versions, legal-basis mapping, processors,
  access/export/erasure/legal hold and retention/deletion schedules under D17.
  No invented retention duration or blanket permanent KYC store. Assess applicable
  incident obligations with the DPO; this plan makes no new legal determination.
- Do not email/SMS real people or collect documents merely to demonstrate a test.
  Obtain approved test destinations, purpose and provider budget first; repository
  fixtures/evidence remain synthetic and redacted.

## Required automated tests

Tests use an isolated migration-owned DB and controlled provider doubles; actual
provider integration tests are separately gated. Include both allowed and denied
fixtures so an always-deny implementation cannot falsely satisfy acceptance.

| Group | Required cases / result |
| --- | --- |
| Token/admin proof adapters | App JWT signing/rotation and wrong issuer/audience/signature/kid/algorithm/not-before; revoked session; required local Keycloak OIDC/TOTP validation and outages; no raw SDK exception escapes |
| SMS gateway | Mock issues zero external sends; stubbed PhilSMS bearer/JSON/recipient mapping; blocked live flag, invalid sender/endpoint, 4xx/5xx/timeout/unknown ACK and no unsafe retry; delivery receipt cannot authenticate |
| Phone registration | PH normalization/invalid inputs, consent staging, duplicate first login converges, unverified contact cannot link account, optional email never grants staff rights |
| OTP lifecycle | CSPRNG six-digit generation including leading zero; keyed hash only, no plaintext persistence; cooldown/expiry/attempt boundary; two-instance atomic consume/limits; same-key replay vs changed body; Redis restart/finalization failure; unknown delivery without duplicate resend |
| Mock isolation | New transport allowed locally/CI only, production startup rejects it, live flag off means zero real calls; no code in HTTP/logs/mobile persistence; capture only through isolated test harness; legacy fixed simulator cannot become runtime auth |
| Session lifecycle | Background/relaunch secure restore then `/me`, expired access refresh, lost refresh response, simultaneous refresh, revoked/logout/all-session denial, device/session ownership, idle/absolute expiry, storage unreadable/reinstall cases |
| Admin MFA | Invited-only login; password-only pre-auth cannot reach admin; enroll/verify/factor ownership; stale/removed factor; replayed challenge; purpose-bound recent reauth; password reset/recovery cannot bypass MFA |
| Browser | Cookie flags and host scope; CSRF/Origin/CORS negatives; session fixation; no token in JS/localStorage; cache/no-store and error redaction; refresh and logout clear the correct state |
| Authorization | Own user positive; other user denied; allowed TODA positive; wrong TODA/city, city-wide escalation, mixed-grant permission, unassigned case, missing MFA/reauth, expired/revoked role, no implicit platform bypass |
| DB isolation | Composite FK rejection, uniqueness/concurrency, RLS `USING/WITH CHECK`, non-owner runtime role, no pooled-context carry-over, deterministic DB-time expiry |
| Verification | Positive synthetic verified identity; pending/rejected/expired/suspended driver/vehicle/TODA/permit denied; no guessed seats; self/foreign/unassigned review denied; concurrent/stale decisions; resubmission preserves decision history |
| Documents | Foreign case/user IDOR, upload key substitution, unsafe type/size/checksum, quarantine/scan failure, missing D17 policy, expired access, masked DTOs and mandatory read audit |
| Audit / outbox | One event per idempotent decision; denied privileged attempt metadata; append-only protections; secret/PII log scanning; duplicate/retry/dead-letter/reconciliation behavior |
| Migration | Fresh/no-op/down/up and sentinel preservation on dedicated DB; grant/identity constraints and rollback ordering; no legacy/demo seed or existing DB access |
| Contract | Generated server/client vocabulary, status/error/schema parity, no `unknown` auth DTO, LF reproducibility on Windows/Linux, unsupported schema vocabulary fails explicitly |

M3 fare maker/checker and M4/M5 operational authorization will add their own
integration tests. M2 tests deny unsupported fare/GPS/booking access and exercise
resource-policy facts without falsely claiming those workflows exist.

## Device/browser and integration acceptance

| Surface | Required evidence before claiming that acceptance |
| --- | --- |
| Passenger Android | Phone/code/consent states; protected navigation and direct links; light/dark, 360 dp, large text, keyboard, accessible labels/focus, offline/expired/retry, secure restart/logout; no premature location prompt |
| Driver Android | Independent package/session/storage; authenticated pending-verification UI; document errors/status; online/dispatch/GPS still gated; fresh suspension state after reconnect |
| Admin browser | Desktop/mobile login/TOTP/recovery/step-up and scoped verification; loading/error/retry; keyboard/focus; CSRF checks and no secret console/localStorage exposure |
| Provider trial | Approved real test SIM destinations on Globe/Smart/DITO where available, delivery timestamps/success/failure and resend/cost/abuse limits; actual email/TOTP/key rotation/revocation results |
| Sensitive storage | SecureStore native build/plugin and backup configuration verified; unreadable entries handled; iOS/device claims only after actual corresponding tests |
| End to end | Passenger login→own account; driver login→pending→scoped staff review→identity eligibility; wrong-TODA reviewer denied; suspension removes eligibility/session authority; all outputs audited and still no live bookings |

Use fresh development clients when native secure-storage dependencies change.
Preserve the M1 software-rendering workaround where needed; emulator evidence is
not physical-device or background-GPS proof. Capture only synthetic identity data,
never real enrollment QR seeds, OTPs, tokens or identity images.

## Release/rollback and M2 definition of done

1. M1 merge `553c5d7` and owner M2 directive verified. M2.0/M2.1 local evidence was
   reviewed and the owner approved M2.2, M2.3 and M2.4. Stop before M2.5;
   no publication/deployment authorization.
2. Schema/tenancy ADR and authority boundaries approved; contract and migration
   changes reviewed before execution. Every slice has a clear feature gate.
3. Required unit/integration/concurrency/authorization/contract checks pass on
   Windows/Linux; actual Android/admin evidence matches the implemented slice.
4. Credential/PII scanning, native storage tests, database preservation, audit and
   outage/recovery tests pass. No mock SMS transport in production or deployed
   legacy fixed-code authentication; CI/local transport remains deliberately mock.
5. An approved provider trial proves the SMS/admin MFA integration being claimed.
   If only local doubles were used, report **simulation acceptance only** and keep
   the provider gate open; do not mark live SMS authentication verified.
6. D16/D17 approvals precede real verification data. Synthetic-only verification
   must be labeled; no driver is approved to operate on that basis.
7. Disable a failed auth/verification capability, revoke affected app sessions
   and reconcile provider effects before re-enabling. Do not downgrade MFA, accept
   unsigned proof or bypass DB checks for availability. Keep existing data and
   use reviewed forward repair once a migration contains retained records.
8. Owner/security review accepts remaining risks and the precise environment
   scope. Public launch, fare/route permissions and physical GPS remain later gates.

## Decisions requiring approval

| Decision | Proposed owner / required evidence | Until resolved |
| --- | --- | --- |
| D11 + ADR-011 | Architecture accepted by owner directive; local disposable migration review/test evidence in doc 57 | No production migration or legal tenant approval inferred |
| D13 / accepted SMS ADR | Keycloak admin provider accepted; PhilSMS live endpoint/sender/pricing/carriers/processing still pending | No real sending, live credentials or claimed live SMS pass |
| D16 verification | City/TRU/TODA authorized reviewers: document checklist, legal permit/expiry/capacity and approval authority | No real verification approval or driver online eligibility |
| D17 privacy | DPO/legal/security: notices, processing basis, storage/processor contracts, retention/erasure/legal hold | No real document collection/public rollout |
| M2-P01 | Security owner: numeric challenge/rate/session/password/reauth/retry policy and revocation bounds | Local synthetic configuration only |
| M2-P02 | Owner/security: first-admin bootstrap, grant delegation, MFA/contact recovery and emergency access | No default administrator, self-promotion or recovery bypass |
| M2-P03 | Product/security: phone recycling, identity linking/personas, device limits and future active-work handover | No automatic account merge or unsafe session takeover |
| M2-P04 | Owner/security/DPO: app JWT signer/refresh protocol and admin cookie vault, key management, storage provider; review proposed permission additions | No secret provisioning or unreviewed sensitive-data endpoint |

Open proposals are logged in [the decision register](43-DECISION-REGISTER.md).
This document records the plan, not approvals or executed M2 test results.

## Owner directive reconciliation - 2026-11-05

High-level architecture, global verified identity with passenger/driver personas,
`city_tenant_id`/`toda_id`, Keycloak admin OIDC+TOTP and initial bounded development
settings are approved. Earlier provisional Supabase recommendations are superseded,
not production approvals. Gate A live SMS, Gate B real documents/privacy, Gate C
real operational verification, Gate D recovery/privileged delegation and Gate E
public deployment remain closed. See doc 56 for exact interfaces and Keycloak
requirements. M2.1 evidence is recorded separately in doc 57.

M2.2 acceptance is tracked in [doc 58](58-M2-AUTHORIZATION.md). It tests real DB
authorization and synthetic server-only credential proofs. This is not a claim
of JWT signature validation, live SMS or real Keycloak MFA integration; those
adapters remain fail-closed and require their actual slice acceptance.

M2.3 now has actual passenger JWT/OTP/session/consent/backend acceptance in
[doc 59](59-M2-PASSENGER-AUTHENTICATION.md): unit/contract cases and real
PostgreSQL/Redis/Fastify positive/negative, concurrency, revocation, isolation and
outage tests. SMS is simulated; PhilSMS uses transport stubs only. Native secure
storage/Android authentication and Keycloak browser/MFA evidence remain future
M2.7/M2.5 gates. One low dependency advisory remains. No production acceptance or
real-data/recovery/driver/public-service gate has been approved by these tests.

M2.4 backend evidence is recorded in [doc 60](60-M2-DRIVER-AUTHENTICATION.md):
positive driver authentication and synthetic identity eligibility, purpose/session/
consent isolation, scoped pending intake, column-grant/RLS/immutable constraints,
revocation, expiry, stale evidence, concurrency and actual outage tests. A measured
database lock wait proves a concurrent verification downgrade serializes with an
eligibility read. Eligible synthetic fixtures still receive server-side denials
for shifts, GPS and offers. No native secure-storage/login, real verification,
Keycloak MFA or operational acceptance follows from these backend checks.

M2.5 update: the owner approved continuation after M2.4. Actual isolated Keycloak
26.8.2 and Playwright now exercise password/TOTP, signed AMR, one-use code flows,
current factors, cookie/Origin/CSRF, scoped grants and application revocation.
This is real local provider integration, not live SMS or production acceptance.
The current execution record and remaining checks are maintained in
[doc 61](61-M2-KEYCLOAK-ADMIN.md). Provider assurance is re-read for every protected
request, bounded for at most five seconds during local authorization; production
out-of-band revocation guarantees still require independent review. Gate D real
bootstrap/recovery/delegation and Gates A/B/C/E remain closed. Stop before M2.6.
