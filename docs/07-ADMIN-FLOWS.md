# Platform, Tenant and Dispatcher Operations

## Superadmin
Create/approve tenants, configure availability of service types, approve policy templates, review cross-tenant incidents under least privilege, view platform-level metrics without default access to excessive personal trip records.

## Tenant admin
Manage tenant-specific staff roles, route/service zones, terminals/geofences, shifts, driver verification, approved vehicles, pricing versions, documents/expiration and reporting.

## Dispatcher console
Live map with position freshness; terminal queue ordered by server time; active rides/offers; no-availability flags; incident flags; manual override requiring reason and audit; actions constrained to approved tenant and service.

## Queue override sequence
Dispatcher selects terminal and reason → server checks `terminal.dispatch.override` permission and tenant → locks queue entry and checks current state → applies safe transition → appends audit event and outbox → notifies affected driver. UI must never directly reorder a queue by locally modifying an array.

## Reporting
KPIs by service, zone, vehicle category and time; export CSV with access controls and privacy filtering; separate operational database query path from heavy analytical exports.

## Incident response
Create case; gather minimized necessary traces; time-bound authorized support access; log every read of restricted data; classify and escalate as required by approved incident handbook and applicable law.

## TODA passenger pickup reservation operations
Authorized tenant/TODA staff manage passenger slot publishing, quota/closure, check-in assistance, no-shows, unfulfilled rides, exception handling and immutable audit reasons. Reservation windows use passenger booking-party units and must reflect approved service capacity. Lowering quota below consumed commitments is forbidden. Driver queue order cannot be changed merely because a passenger holds a window; justified manual exceptions follow audited TODA queue-override permissions. See ADR-008.
