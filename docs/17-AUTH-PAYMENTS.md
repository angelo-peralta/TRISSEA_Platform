> **v1.5 Tuguegarao pilot priority:** Start with `docs/00-PILOT-STATUS.md` and `docs/48-ADR-010-TUGUEGARAO-PILOT.md`. Historical scope below is preserved; any conflicting release sequence or fare assumptions are superseded by v1.5, especially Reservation being deferred and uploaded fares remaining unverified.

# Auth, Notifications and Payments — Adapter Specification

## Identity provider decision
Use an OIDC-compatible provider with reliable Philippine OTP/SMS options; Supabase Auth may be evaluated for initial backend+storage continuity, but evaluate OTP pricing/delivery, provider limits, JWT session handling and international compliance. Keep identity behind `IdentityProvider` adapter.

## Authentication flows
Phone verify → server creates/links app_user using verified provider subject → select tenant scope where authorized → driver membership remains PENDING until staff approval → issue server API authorization based on role, tenant and effective policy. SMS OTP abuse throttling required.

## Notification adapter
- Push: Android FCM / iOS APNs or provider gateway; use as hint to open app/fetch server state, not proof of delivery/acceptance.
- Socket: authenticated real-time offer, ride state and live location events.
- SMS: operational fallback only with privacy notice/consent and rate limits.

## Payment adapter
- MVP: Cash `PENDING_COLLECTION` → driver confirms collected / dispute → ledger reconcile; never conflate cash collection with platform fee already settled.
- Future: integrate contracted Philippine provider with hosted/tokenized checkout and signed webhook verification.
- Record separate payment state `UNPAID`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`, `DISPUTED` and `payment_records` history.
- For callbacks: store external event unique ID (inbox), validate amount/currency/order/tenant, apply idempotent transaction and alert on mismatch.
