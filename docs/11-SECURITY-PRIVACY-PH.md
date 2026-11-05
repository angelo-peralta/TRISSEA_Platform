# Security, Safety and Philippine Legal Readiness

> Engineering guidance, not legal advice. A Philippines-qualified transport/legal/privacy professional must confirm the operating model, permits and compliance requirements before public launch.

## Regulatory gate
- Identify whether the offering is a Transportation Network Company (TNC), Transportation Network Vehicle Service (TNVS), LGU-regulated tricycle/terminal service, shuttle, or other classification.
- Check current LTFRB and relevant LGU ordinances/franchising before enabling each vehicle/service category. Do not infer that an app permits unlicensed public transport operations.
- Confirm insurance, driver licensing, operator accreditation, fare regulation, consumer complaint channels and emergency policies.
- Keep a service-type compliance register per tenant and city; use a launch-blocking approval status.

## Data privacy
Philippine RA 10173 (Data Privacy Act) principles include transparency, legitimate purpose and proportionality, data minimization, security and retention limits. Prepare privacy notice, lawful basis mapping, data sharing/processor contracts, retention schedule, breach handling and privacy impact assessment.

### Location risk
Precise passenger and driver routes can expose highly sensitive behavior. Collect strictly what operations require; restrict to active trip/safety users; use short retention for raw telemetry unless justified. Do not display passenger phone numbers or persistent live locations to unassigned drivers.

## Authentication/authorization
- OIDC/OAuth2 bearer tokens signed by configured provider; API validates signature, issuer, audience, expiry and revoked membership conditions.
- Driver onboarding uses document verification and server-approved `driver_tenant_authorizations`.
- Deny-by-default RBAC and resource ownership. Every query filters tenant ID and checks relevant permission; consider DB RLS where operationally appropriate.
- Admin MFA and privileged action reauthentication; all overrides logged.
- Secrets in secret manager; no production `.env` committed; signed uploads with antivirus/size/type checks.

## Abuse and fraud controls
Rate-limit OTP, login, quote search, ride creation, location updates, cancellation; block automated enumeration. Device attestation and GPS anomaly review as defense-in-depth, never sole grounds for arbitrary punitive action. Location sent on TLS only.

## Payment/security
Start cash-first. For future payment provider integration: tokenize externally, no card PAN stored, verified webhooks, deduplicated provider event IDs, ledger reconciliation and refunds separated from ride status.

## Audit and safety
Append-only `audit_logs` and `ride_events`, structured trace IDs and access logs. SOS button is not a substitute for documented emergency operations. Publish support response procedures and driver/passenger dispute handling.

## Launch security gate
Threat model, penetration test, backup/restore exercise, privacy impact assessment, consent/notice review, tenant access test, SMS abuse controls, driver background location approval, operational permit validation.
