# Admin Panel: Initial Screen Specification

Navigation: **Overview / Live Rides / Drivers & Vehicles / TODAs & Zones / Fare Management / Service Availability / Incidents / Audit / Settings**. Side nav scoped by role; mobile responsive but desktop operational focus.

## Admin minimum screens
- **Overview:** city aggregate, active bookings, online verified drivers, unfulfilled bookings, no-driver count, GPS-stale alerts, fare version. Mask PII by default.
- **Fare Management:** current active vs draft schedules; CSV import, location mapping, independent review/approve, future-dated effective, export audit history; visible legal evidence upload requirement.
- **Driver verification:** driver's license and vehicle permit checklist, TODA binding, approval expiry, recorded reviewer; private document previews time-limited.
- **TODA & service zones:** organizations, permitted zones/routes, verified vehicles, per-TODA service enablement, driver shift rules. City admin cannot silently bypass documented operator rules.
- **Live rides:** filters by status and TODA; support can see masked names/phone unless case-based access. Force cancel/reassign requires reason and permission with recorded user and outcome.
- **Settings:** OTP provider health, feature flags, permitted road profile versions, regulatory source documents, incident contacts, data retention metadata. No secret values rendered in UI.

## Fare change modal acceptance
- Input current vs new per zone/service/discount; show PHP currency and % delta for review, but require absolute approved value from matrix.
- Import validation flags unmapped barangays, duplicates, unknown directions, negative prices and effective date conflicts.
- Approval modal shows ordinance reference and actual screenshot/PDF, individual approver identity, difference preview, and new quote impact.
- Editor cannot approve; approver cannot modify source draft while approving; both actions audited.
- Active policy always retains earlier snapshots. History cannot be edited or deleted in normal admin interface.
