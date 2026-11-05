# M2.0 architecture reconciliation and Keycloak boundary

Date: 2026-11-05. Owner M2 directive approves architecture and local M2.0/M2.1;
no production service or legal/privacy activation. M1 merge `553c5d7` was fetched
and verified. A separate worktree preserves the original dirty planning checkout.

## Exact module interfaces

Identity owns verified global users, personas and phone proof. SMS owns transport
only (`MockSmsGateway`/future `PhilSmsGateway`). Sessions owns app JWT/refresh/BFF
state and DB revocation. Tenancy owns memberships and same-grant permission/scope.
Keycloak supplies admin OIDC credential/MFA proof; it cannot create app grants.
Verification owns synthetic cases and versioned decisions in M2.6. Audit/outbox
commits with sensitive mutations; workers reconcile external effects separately.

`city_tenant_id`/`cityTenantId` is canonical; `toda_id`/`todaId` is organizational
scope. Global user/personas do not imply membership. Multiple approved memberships
and assignments are explicit rows; no matching unverified contact auto-link.
Issuer is an exact configured realm URL; external subject is immutable opaque
provider `sub`, encrypted at rest with keyed digest lookup. Admin mapping references
the same identity/user composite FK and a separate approving owner/reference.
No mapping/grant creation is exposed in M2.1.

## Role and permission vocabulary

Roles: `PLATFORM_ADMIN`, `CITY_OPERATIONS_ADMIN`, `CITY_FARE_EDITOR`,
`CITY_FARE_APPROVER`, `TODA_MANAGER`, `TODA_DISPATCHER`, `VERIFICATION_OFFICER`,
`SUPPORT_AGENT`, `PRIVACY_OFFICER`, `SECURITY_AUDITOR`, `DRIVER`, `PASSENGER`.
The directive's combined Privacy Officer / Auditor label maps to **two** existing
roles, never a new combined super-role. Existing permissions: `fare.draft`,
`fare.approve`, `fare.activate`, `toda.members.manage`, `driver.verify`,
`rides.assist`, `rides.read.masked`, `gps.read.live`, `privacy.dsr`,
`incidents.escalate`, `config.manage`. M2.1 seeds catalogs/scope compatibility only;
no role-permission edges or user assignments. Operational handlers stay absent.
Self-service is ownership-checked in future auth slices, not caller role payloads.
New document/grant permission identifiers require an explicit M2.2 review.

## Keycloak Docker and realm requirements — M2.5 specification, not implemented

- Separate Compose profile/project and PostgreSQL identity DB with distinct owner,
  runtime credentials and storage; never reuse TRISSEA runtime role or DB schema.
  Preserve M1 services/volumes. Bind local endpoints to loopback. M2.5 must review
  a maintained fixed image release **and digest**, security and OIDC-library
  compatibility, and record actual versions. No unreviewed image is installed now.
- Local synthetic realm `trissea-local`; never authenticate app users through
  Keycloak `master`. Disposable generated bootstrap credentials live only in an
  ignored local file/test secret store, no insecure default account. Starting
  Keycloak does not bootstrap a TRISSEA platform admin.
- Confidential client `trissea-admin-bff`, standard Authorization Code enabled,
  PKCE S256 required, implicit/direct-access/password/device grants disabled;
  exact callback/logout URIs, no wildcard origins. API tokens never enter Vite.
- Required password + TOTP execution (no optional/alternative password-only path),
  enrollment before admin access, verified invited subject, no public registration.
  Disable self-service reset-password, reset-OTP/recovery codes, social linking,
  account deletion/contact replacement and account-console routes/actions that
  would bypass Gate D. Test direct URLs and action tokens, not just hidden links.
- Nest validates OIDC state/nonce/PKCE, issuer, signature/algorithm, client audience
  and subject. Configure and test a realm-specific assurance contract with current
  TOTP factor status, auth time and stale/removal/replay negatives. A generic `acr`,
  realm role or refresh timestamp is insufficient. Fail closed if current proof
  cannot be established safely. Reauthentication uses a new provider flow.
- Initial administrative mapping requires owner-approved synthetic provisioning
  for tests, no public registration or automatic realm-role mapping. Staff grants,
  recovery and delegation remain separately gated. Application DB suspension
  immediately denies app sessions independent of Keycloak logout.
- Production requires hardened start (no `start-dev`), HTTPS, exact hostname and
  trusted proxy headers, private management/health/metrics endpoints, encrypted
  backups with restore drills, signing/client-secret rotation, patch/monitoring,
  and approved out-of-band revocation/factor-change detection bounds.

## SMS and lifecycle requirements

Development defaults: six digits, 300-second expiry, five attempts, 60-second
resend, destination five/hour and ten/day, JWT 600 seconds, admin idle 900 seconds,
fresh proof 300 seconds. Validation rejects unlimited/unsafe values and all live,
recovery, real-document or operational activation in M2.1. M2.3 will add transport
implementations; production mock/incomplete live configuration must fail startup.
No public mock-message endpoint. Isolated harness reads in-process captured
synthetic messages; no network sends, log codes or persisted plaintext OTP.

Account restriction increments DB auth version, revokes app sessions/refresh,
and appends audit/outbox atomically. Every future protected request checks current
DB state; stale JWT/Redis/provider cache cannot retain access. No active HTTP
identity resolver is wired in M2.1: existing default-deny guard remains intact.

## Approvals still unresolved

Gates A–E and D16/D17 remain pending as recorded in the decision register. Recovery
design is policy-first: account/phone ownership proof, number recycling hold,
independent review, notification, revocation and appeal must be defined before
implementation. No email-match merge, temporary administrator bypass, password
reset or MFA recovery is activated. Architecture acceptance does not establish a
legal document checklist, permitted vehicle capacity or operator approval.

Primary implementation references reviewed for this boundary:
[Keycloak OIDC](https://www.keycloak.org/securing-apps/oidc-layers),
[Keycloak containers](https://www.keycloak.org/server/containers),
[PostgreSQL 17 RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
[Drizzle constraints](https://orm.drizzle.team/docs/indexes-constraints).
