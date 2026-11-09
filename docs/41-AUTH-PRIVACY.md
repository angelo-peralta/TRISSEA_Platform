# Initial Sign-in and Philippine Privacy/Trust Architecture

## User-facing sign-in decision
- Passenger: mobile number in `+63` E.164 format → SMS OTP → create account/consent → optional email. Do NOT require password or government ID for every passenger.
- Driver: same phone OTP, then separate legal identity, TODA affiliation, vehicle documentation, MTOP/license/insurance verification by authorized staff. Unverified driver can sign in but cannot go online/receive ride offers.
- Admin/dispatcher: individual email/password or organization SSO, **mandatory TOTP MFA** and phishing-resistant method where supported; high-impact actions require recent reauthentication.
- **Historical recommendation, superseded/rejected by the owner M2 directive (2026-11-05), not an implementation choice:** **Supabase Auth** for phone OTP if a production SMS provider with validated Philippine deliverability, cost and rate limits is contracted. Abstract behind `IdentityProvider`; do not assume Supabase Auth includes free SMS or offers reliable delivery without configuration. For local tests use development-only OTP simulator (NEVER deployed).

## Approved M2 identity providers ? 2026-11-05

TRISSEA owns six-digit SMS OTP and application sessions. Mock transport is local/CI
only; PhilSMS is a future gated transport. Self-hosted Keycloak supplies administrator
email/password + REQUIRED TOTP over OIDC Authorization Code/PKCE S256 through a secure
Nest BFF. Supabase must not be installed or integrated. No public staff registration
or recovery activation. Architecture approval does not satisfy privacy/legal gates.
See [ADR-011](55-ADR-011-M2-IDENTITY-TENANCY-DRAFT.md) and [realm boundary](56-M2-ARCHITECTURE-AND-KEYCLOAK.md).

## Protection by design
1. Collect only data needed for bookings; separately explain foreground location and background driver-only tracking. Passenger background location is not a requirement for MVP.
2. Driver coordinates collected only while an authorized online shift or active job needs tracking; location stop/restriction events must immediately stop transmissions. Keep raw historical trails only when documented retention/legal necessity permits.
3. Passenger exact address shared only with assigned driver for operational window; pre-assignment driver sees controlled approximate pickup needed for offer assessment, per approved safety policy.
4. Per-TODA row/resource authorization, password/MFA for admin, least privilege, secure storage, audit logs of identity document and precise-location reads.
5. Do not put OTP, IDs, full phone numbers or precise GPS in app telemetry, URL query strings or analytics events; encrypt backups and private documents.
6. Formal Data Protection Officer/privacy contact, Privacy Impact Assessment, Data Processing Agreements, breach-response playbook, data subject access/erasure/retention approval and applicable NPC registration assessment before rollout.
7. Under the Philippines Data Privacy Act/IRR and NPC rules, qualifying notifiable breaches may require notice within 72 hours; escalate immediately to DPO for legal determination. Verify applicable criteria, do not treat every incident as identical.

## Suggested retention design — POLICY NOT YET APPROVED
- Transient driver last location: overwrite in place, with short staleness threshold.
- Detailed ride GPS trail: default **off** until necessity and retention duration approved; avoid "always record full routes".
- Completed ride summaries and fare snapshots: retention owner determines legal/accounting timetable.
- Identity documents: retention tied to verification and licensing/legal basis; not available in analytics.
- Audit logs: integrity-protected, documented restricted retention.
- Make retention configurable with per-category deletion/archive/export tests; no permanent storage by default.

## Source verification
https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/
https://privacy.gov.ph/pips-and-pics/faqs/
https://privacy.gov.ph/pips-and-pics/breach-reporting/
https://docs.expo.dev/versions/latest/sdk/location/
