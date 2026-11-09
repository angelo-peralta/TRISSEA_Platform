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

## M2.2 conservative catalog mapping

Owner approved continuing after M2.1. Migration `0003_authorization` adds existing
permission identifiers only, with no user assignments or delegation API. Policies
also require current session/membership, matching role and the same grant scope.

| Role | Catalog permissions | Additional policy boundary |
| --- | --- | --- |
| CITY_OPERATIONS_ADMIN | config.manage | Explicit city configuration; fresh admin proof |
| CITY_FARE_EDITOR | fare.draft | City scope; no fare handler in M2 |
| CITY_FARE_APPROVER | fare.approve | City, fresh proof and known different maker; no fare handler |
| TODA_MANAGER | toda.members.manage | Exact verified TODA and fresh proof |
| TODA_DISPATCHER | rides.read.masked, rides.assist | Exact TODA; assist catalog-only, no ride operation |
| VERIFICATION_OFFICER | driver.verify | Assigned case, scope, fresh proof, no self-review; synthetic policy tests |
| SUPPORT_AGENT | rides.read.masked, incidents.escalate | Assigned support case in grant scope; no identity documents |
| PRIVACY_OFFICER | privacy.dsr | Assigned purpose-bound privacy case, city scope, fresh proof |
| PLATFORM_ADMIN | config.manage | Explicit PLATFORM infrastructure scope; no city/TODA/PII wildcard |
| SECURITY_AUDITOR | None in existing vocabulary | Narrow metadata permission pending M2-A01; own account only |
| PASSENGER, DRIVER | No administrative edges | Purpose-bound own-account/session access; no operating eligibility |

`fare.activate` and `gps.read.live` stay unassigned. Catalog edges and synthetic
positives do not activate operational handlers. Missing resource adapters deny.
See [M2.2 implementation](58-M2-AUTHORIZATION.md).

M2.4 implementation note: DRIVER own-account/session/intake actions require a
verified DRIVER-purpose application session and current ownership/consent. These
static server action keys add no administrative role/permission edges. Selecting
an explicitly configured synthetic TODA creates a pending request, not membership
or a grant. A synthetic eligible fixture is still denied online/GPS/dispatch.
See [driver boundary/evidence](60-M2-DRIVER-AUTHENTICATION.md).

M2.5 adds no role or permission identifier. Real Keycloak password/TOTP proof
maps only through an approved internal KEYCLOAK identity; provider roles cannot
create TRISSEA grants. The read-only TODA access probe requires the existing
TODA_MANAGER / toda.members.manage / exact TODA tuple and fresh MFA. Every
protected request rechecks current app/IdP state. Own admin session/logout keys
grant no operational authority. See [doc 61](61-M2-KEYCLOAK-ADMIN.md).

## Required tests

M2.6 uses existing permission tuples only. `VERIFICATION_OFFICER` with
`driver.verify` reviews assigned DRIVER/VEHICLE cases in its CITY or exact TODA
grant. `TODA_MANAGER` with `toda.members.manage` reviews assigned TODA_MEMBERSHIP
cases in its exact TODA grant. Both require current membership, fresh admin MFA
and a reviewer different from the applicant. Assignment does not grant authority;
permissions and scope must match within one current grant. A manager cannot review
driver/vehicle evidence through its membership route. A platform role alone grants
no case/evidence access. No arbitrary assignment/delegation API is authorized.
Applicants can read and submit only their own synthetic cases. Doc 62 records
implementation status and evidence; real reviewer responsibilities remain unapproved.

Cross-TODA IDOR; wrong-city admin; self-approval of fare; suspended driver accepts offer; support access without case; unauthorized GPS query; missing MFA; stolen token; privilege escalation; bulk export denial; admin creates booking on behalf of passenger only under logged consent/helpdesk case.
