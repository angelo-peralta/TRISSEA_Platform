---
name: trissea-auth-security
description: Build or review TRISSEA SMS OTP, PhilSMS transport, Keycloak OIDC/TOTP, JWT/session/refresh, authorization, consent, driver-verification security and privacy. Use for login, permissions, account recovery, sensitive records or any security-critical changes.
---

# Authentication, authorization and security

Read `AGENTS.md`, ADR-011 and the applicable M2 security/data documents. All identities, credentials and permissions are server-controlled. Explicit owner approvals gate real SMS, real documents, privileged recovery and production activation.

## Design invariants

- Passenger/driver OTP: TRISSEA owns proof and sessions. Generate unpredictable six-digit OTP, keyed hash only, five-minute configurable expiry, atomic Redis attempt/single-consume and one authoritative DB redemption; handle resend, replay, provider unknown responses and Redis/DB loss fail-closed.
- `MockSmsGateway` is for isolated local/CI only. No production fallback, public OTP retrieval, fixed-code auth, logging or request-echoed secrets. PhilSMS transport has zero identity authority; live delivery requires separately approved account, sender, rate, budget, destinations and privacy.
- Admin: Keycloak is the selected self-hosted identity/MFA provider. Use reviewed OIDC Authorization Code + PKCE, validate issuer/audience/state/nonce/signatures/expiry, verify the MFA assurance method, and establish opaque server-side application browser session. The browser receives no Keycloak provider tokens in localStorage.
- NestJS/PostgreSQL owns current app grants, status, city/TODA scopes, assigned case access, verification, session revocation and audit. External provider roles or client headers never confer TRISSEA privileges. Platform admin is not unrestricted sensitive-data access.
- Use short-lived app access credentials, digest-only rotating opaque refresh credentials and DB session gates. Design recovery, account merge, SIM swap/recycled phone and MFA reset, but leave routes disabled until approved.
- Minimize PII; encrypt private fields, implement separate lookup digests, restrict document storage and audited access. No real identity-document intake until D16/D17; no default identity/verification approval.

## Threat-led implementation and tests

1. Define actors and trust boundaries, protected assets, potential attacker inputs and failure mode.
2. Choose the smallest reviewed protocols/libraries. Don't invent crypto or a password implementation. Keep secrets out of frontend env, URLs, logs, telemetry and test artifacts.
3. Add negative tests for enumeration, attempts, replay, concurrent verification, wrong audience/issuer/key, stale grants, cross-TODA IDOR, missing MFA/reauth, self-review and revocation races.
4. Verify startup denial for misconfigured production, provider outage behavior, browser CSRF/Origin/cookie flags and safe error redaction.
5. Record residual risks and external gates, distinguishing mocked tests from real carrier/Keycloak/device trials.
