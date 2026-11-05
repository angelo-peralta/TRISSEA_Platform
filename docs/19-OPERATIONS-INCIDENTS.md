# Incident & Reliability Runbook (Draft)

## Severity model
SEV1: wrong passenger/driver assignment, cross-tenant data exposure, active-travel safety risk, major transaction outage. SEV2: significant booking failure, lost offers or GPS outage. SEV3: minor UX/report issues.

## On-call dashboards
Ride state transition failures, DB deadlocks/unique constraint conflicts, unprocessed outbox depth, BullMQ waiting/failed jobs, stale heartbeat fraction, socket disconnect rate, failed SMS/push delivery, routing ETA timeout, database CPU/IO/connections and API error budget.

## Incidents
### Duplicate assignment suspected
Stop new dispatching for affected tenant if needed; query ride/driver unique index and events; preserve logs; provide safe operator notification; rollback only via approved safety incident workflow.
### Redis outage
Suspend new offers if dispatch pipeline unsafe; continue showing DB-confirmed states; restore Redis and rerun outbox/reaper; do not infer client-confirmed acceptance.
### Primary DB outage
Disable new bookings and state-changing actions; show user-facing degraded state; follow DB failover/runbook; verify idempotency replay and reconcile outstanding offers.
### GPS provider or mobile network issues
Mark position stale; stop dispatching stale driver locations; avoid implying location is accurate; support explicit meet-at-terminal guidance as policy allows.
### SMS/identity outage
Do not disable token checks; existing authenticated user journeys may continue within safe session policy while new OTP sign-ins are temporarily unavailable.
### Privacy/security suspected breach
Restrict access, preserve evidence, invoke DPO and incident handling, follow legal reporting obligations and approved deadlines.

## Standard recovery sequence
Detect → declare incident → contain → preserve evidence → restore authoritative DB safely → run reaper/outbox replay → audit assignments/payments → communicate to impacted actors → postmortem → prevention action.
