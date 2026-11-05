# Data Model and Integrity

## Sources of truth
- PostgreSQL: authoritative users, tenant memberships, driver approvals, vehicles, terminals, queues, fare rules, quotes, rides, offers, audit, payment ledger and outbox.
- Redis: non-authoritative live positions/presence, rate-limit counters, ephemeral subscriptions, BullMQ transport.
- Object storage: encrypted documents/attachments with signed URLs and restricted access.

## Ride-option model extension
The base `001_core.sql` is a **private/terminal ride schema**. `database/004_service_options_REFERENCE.sql` extends the design with a `ride_option` discriminator for ride-bearing options (`REGULAR`, `SHARED`, `SPECIAL`), special ordered stops, pooled-group/manifest tables, a driver-engagement lock, and distinct **passenger-only** TODA pickup reservations (ADR-008). The extension is reference-only until the dispatcher and transactions are refactored and reviewed. Reservation is intentionally **not** a `rides` row.

## Core tables in migration
| Domain | Tables | Key integrity control |
| --- | --- | --- |
| Identity | `app_users`, `tenants`, `tenant_memberships` | unique provider subject, one membership per user/tenant |
| Driver fleet | `drivers`, `vehicles`, `driver_vehicles`, `driver_tenant_authorizations` | verified status and vehicle approval gate |
| Zones | `service_zones`, `terminals`, `terminal_routes` | PostGIS geometry and tenant FK |
| Queue | `terminal_queue_entries` | partial unique global active queue entry per driver |
| Booking | `fare_policies`, `quotes`, `rides`, `ride_offers`, `ride_events` | active ride+offer partial unique indexes |
| Reliability | `idempotency_records`, `outbox_events`, `audit_logs` | unique request key, durable events |
| Payments | `payment_records` | external provider unique reference |

## Monetary data
Store `amount_centavos BIGINT` and `currency CHAR(3) CHECK(currency='PHP')`; write deterministic fare components and fare policy version to quote/ride snapshot. Avoid floats for prices.

## Geospatial data
Use PostGIS `geography(Point,4326)` for meter-distance driver queries where appropriate; terminal and zone polygons as `geometry(MultiPolygon,4326)`; GiST indexes. API client uses `[longitude, latitude]` GeoJSON coordinates to avoid ordering mistakes.

## Key constraints
- Partial unique index one active ride per passenger.
- Private ride uniqueness must be reconciled with Shared pooling: use one authoritative active **driver engagement** spanning exclusive rides and pooled groups. The legacy private-ride index alone cannot support multi-passenger Shared rides. Do not remove it without transactional replacement.
- Partial unique index one PENDING offer per ride and per driver.
- Partial unique index one WAITING/RESERVED queue membership per driver across all terminals/tenants.
- Tenant-scoped composite FKs where practical to prevent cross-tenant references.
- Immutable event/audit rows; do not delete on routine cancellation.

## Privacy retention
Default retention periods deliberately **TBD** pending privacy impact assessment and statutory/legal advice. Live telemetry should expire quickly, detailed route points have bounded retention, and audit/legal records follow approved schedules. Implement deletion/export and legal hold procedures.

## Migration strategy
`database/001_core.sql` is a reference PostgreSQL-first baseline. Integrate it into a versioned migration tool **before implementation**; never run manual `schema push` against production. Current migration is not a substitute for production data model review, RLS/role policy review, or encryption key management.
