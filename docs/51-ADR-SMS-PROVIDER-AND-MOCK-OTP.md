# ADR — TRISSEA initial SMS provider and M2 mock OTP

Status: **Accepted for implementation planning; real sending NOT authorized**
Date: 2026-11-05

## Decision
- Use PhilSMS as the initial Philippine SMS integration candidate, subject to an account-level quote and mobile-network acceptance testing. Website advertises **from ₱0.35/message, no minimum top-up**, but exact OTP route pricing is not published on the open page.
- Use `SMS_PROVIDER=mock` on local development and CI. No real SMS is sent.
- Introduce a narrow SmsGateway transport interface. M2 authentication owns OTP generation, hashed verification, sessions and throttles; do not make the SMS gateway a source of identity truth.
- Explicit `SMS_LIVE_ENABLED=true` required before provider adapter sends. Never enable mock SMS in production or silently fall back to mock when live delivery fails.
- PhilSMS's published legacy API documents `POST https://app.philsms.com/api/v3/sms/send` with `Authorization: Bearer`, JSON `{recipient: '639...', sender_id, type: 'plain', message}`. Current account/dashboard endpoint and sender name must be verified before live activation.

## Security and functional requirements
1. Server-generated cryptographically random six-digit OTP, with single-use challenge ID and purpose binding. Store a keyed hash only, never plaintext. Five-minute TTL (configurable).
2. Redis-backed atomic consume/attempt counters and throttle, with database-backed security audit events without codes or full phone numbers. M1 in-memory `DevelopmentOtp` remains dev/test only, not reusable in deployed environments.
3. Generic public responses for known/unknown numbers to avoid enumeration. Per-phone/IP/device quotas, resend cooldown and daily SMS budget, concurrency tests.
4. No OTP in HTTP responses, logs, crash reports, analytics or mobile persistent storage. Allow test harness to inspect OTP only via isolated non-public mechanisms. Never expose mock retrieval on public ports.
5. Never treat provider HTTP acceptance as handset delivery. Avoid automatic immediate retry after ambiguous network timeout to prevent duplicate charge or code confusion.
6. Phone numbers normalize to E.164 `+639xxxxxxxxx` internally. Provider gets `639xxxxxxxxx` per currently documented API.
7. No secrets in `.env.local.example`, Git, frontend bundles or API responses; production sender ID must be registered and approved.
8. Test OTP delivery on Globe, Smart, DITO and relevant mobile-number-portability cases before switching from mock.
9. Production fail closed if SMS provider is unset, unreachable, unapproved or out of budget; do not bypass OTP verification.

## Pending vendor checks

Owner M2 directive update (2026-11-05): TRISSEA six-digit OTP and mock local/CI
transport are approved for implementation. Initial development limits are 300s,
five attempts, 60s resend and destination five/hour and ten/day. These are not
production approvals. Keycloak owns only admin credential/MFA proof; Supabase is
rejected. Gate A remains closed: no real SMS, provider fallback or credentials.
- Confirm current PhilSMS dashboard API credentials/endpoint (public docs reference the older `app.philsms.com` interface).
- Confirm billing rate, VAT, SMS segmentation, credit expiry, sender ID and all Philippine carrier support in the actual account.
- Verify data-processing agreement, local/foreign data flows and retention requirements before transmitting real phone numbers.
- Recompare with CAST and UniSMS when pilot SMS volume is known.

Sources (reviewed November 5, 2026):
- https://www.philsms.com/
- https://app.philsms.com/developers/documentation
- https://www.cast.ph/pricing
- https://unismsapi.com/docs/pricing

## M2.3 implementation result — 2026-11-06

The passenger backend now uses random six-digit OTP, keyed/purpose/client-bound
hashes, atomic Redis attempts/consume, durable PostgreSQL budget/redemption and
revocable sessions. `SmsGateway` has an in-memory test-only capture mock and a
potential PhilSMS adapter tested exclusively with injected transport stubs.
The runtime accepts mock only in explicit local-synthetic development/test and
never selects PhilSMS. No live network delivery, sender/endpoint approval or
production startup is enabled. The legacy fixed-code simulator is not wired to
M2 routes. See [doc 59](59-M2-PASSENGER-AUTHENTICATION.md) for exact policy,
non-public harness, uncertainty handling, evidence and remaining Gate A checks.

M2.4 reuses that same OTP/gateway implementation for DRIVER. Destination budgets
and cooldown remain shared; hash/binding/active proof and sessions are purpose-
bound. A verified canonical phone maps to one global identity with separate
personas. No new provider configuration, live sending or recovery is enabled.
