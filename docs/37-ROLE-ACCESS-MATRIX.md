# Role and Access Blueprint — Least Privilege

## Jurisdiction tenancy
One Tuguegarao `city_tenant`, TODAs in `toda_organizations`, cities separated from future deployments. TODA manager/dispatcher must have **organization-scoped** access, not cross-city unrestricted data. Authorize at API/service layer using explicit tenant+TODA+resource ownership; UI hiding is never sufficient.

| Role | Scope | Allowed | Specifically denied |
|---|---|---|---|
| `PASSENGER` | own account/rides | profile, quote/book/cancel, own receipts | driver personal docs, other passenger records |
| `DRIVER` | own shift/jobs | location during active shift, accept offers, trip transitions, cash collection | changing fare, self-verifying, other drivers' locations |
| `TODA_MANAGER` | approved TODA(s) | eligible driver onboarding review, shift reports, operational exceptions with reason | publishing city fare, city-wide PII search |
| `TODA_DISPATCHER` | assigned TODA/terminal | view live eligible supply, assist rides, audited exceptions | see all city trips, approve identity or fare |
| `CITY_OPERATIONS_ADMIN` | city operational | configure authorized service areas/flags, monitor incidents, approve driver rules | direct fare self-publish, decrypt ID by default |
| `CITY_FARE_EDITOR` | city fare policies | draft/import/compare fare rules | publish or approve their own draft |
| `CITY_FARE_APPROVER` | city fare policies | approve evidence-backed prices and effective dates | approve own authored change |
| `VERIFICATION_OFFICER` | assigned authorization queue | view restricted KYC docs through short-lived URLs, approve/reject with reason | fare publish, routine ride location browsing |
| `SUPPORT_AGENT` | assigned support cases | masked ride details, escalate complaints, limited case history | bulk export GPS, ID documents, city fare changes |
| `PRIVACY_OFFICER` | cross-TODA compliance | audit, data subject request, documented controlled access for investigations | edit ride fares or silently modify audit logs |
| `SECURITY_AUDITOR` | logs/metrics | metadata-only read, exception reviews | normal passenger/driver precise GPS |
| `PLATFORM_ADMIN` | infrastructure | maintenance, tenant provisioning, policies-as-code | routine bulk PII access; emergency break-glass only |

No anonymous route or price editor. One person can hold multiple roles only if explicit conflict-of-interest rules permit; **fare maker/checker separation applies even across role combinations**. Permission families: `fare.draft`, `fare.approve`, `fare.activate`, `toda.members.manage`, `driver.verify`, `rides.assist`, `rides.read.masked`, `gps.read.live`, `privacy.dsr`, `incidents.escalate`, `config.manage`.

## Data security controls

M2.0 reconciliation (owner directive, 2026-11-05): the twelve role identifiers
above and eleven listed permissions are canonical. Privacy Officer / Auditor
means the separate `PRIVACY_OFFICER` and `SECURITY_AUDITOR` roles. M2.1 seeds only
catalogs/scope compatibility; role-permission edges and user assignments are not
seeded. `SELF`, `CITY`, `TODA`, `PLATFORM` grant scope always binds an explicit city
membership; PLATFORM never implies cross-city/PII access. Keycloak roles and
caller scope flags create no TRISSEA permissions. M2.2 implements same-grant,
ownership, duty and current-session checks. No operational permissions are enabled
merely by catalog presence. Recovery/privileged delegation remain Gate D closed.
- RLS as defense in depth where data is directly exposed; **all mobile clients access operational data only through secured NestJS APIs**, not public-table PostgreSQL credentials.
- APIs enforce identity, resource ownership, tenant/TODA scope, duty context, verification status, scoped permission, record state and rate limits on every action.
- Sensitive IDs and driver licenses in private encrypted object storage with short-lived signed URLs; audit each access. Sensitive document approval cannot be delegated to unauthenticated customer support.
- City-wide dashboards aggregate where possible, with reason-required and time-limited drill-down; bulk export requires special permission and redaction.
- Append-only audit trail for fare approvals, identity decisions, ride exceptions and privileged reads; isolate and protect logs.
- Admin sessions: SSO or email/password with mandatory TOTP MFA; no shared login accounts; session expiry/reauth on high-risk changes.

## Required tests
Cross-TODA IDOR; wrong-city admin; self-approval of fare; suspended driver accepts offer; support access without case; unauthorized GPS query; missing MFA; stolen token; privilege escalation; bulk export denial; admin creates booking on behalf of passenger only under logged consent/helpdesk case.
