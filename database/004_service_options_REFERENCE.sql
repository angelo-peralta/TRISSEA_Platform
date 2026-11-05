-- TRISSEA four-service schema design extension v1.3 (ADR-008 passenger TODA pickup only).
-- REFERENCE ONLY: DO NOT APPLY AUTOMATICALLY to a deployed DB.
-- Shared requires replacing private driver uniqueness with authoritative engagement locks;
-- current API/worker are unimplemented. This extension alone does NOT enable safe pooled rides.
-- Review under docs/25-RIDE-OPTIONS.md / 26-SHARED-POOLING.md before migration approval.

-- Ride-bearing service type (Reservation deliberately separate).
ALTER TABLE quotes ADD COLUMN ride_option text NOT NULL DEFAULT 'REGULAR'
  CHECK (ride_option IN ('REGULAR','SHARED','SPECIAL'));
ALTER TABLE rides ADD COLUMN ride_option text NOT NULL DEFAULT 'REGULAR'
  CHECK (ride_option IN ('REGULAR','SHARED','SPECIAL'));
ALTER TABLE quotes ADD COLUMN party_size integer NOT NULL DEFAULT 1 CHECK (party_size >= 1);
ALTER TABLE rides ADD COLUMN party_size integer NOT NULL DEFAULT 1 CHECK (party_size >= 1);
ALTER TABLE quotes ADD COLUMN is_round_trip boolean NOT NULL DEFAULT false;
ALTER TABLE rides ADD COLUMN is_round_trip boolean NOT NULL DEFAULT false;
ALTER TABLE quotes ADD CONSTRAINT quote_roundtrip_only_special
  CHECK (NOT is_round_trip OR ride_option = 'SPECIAL');
ALTER TABLE rides ADD CONSTRAINT ride_roundtrip_only_special
  CHECK (NOT is_round_trip OR ride_option = 'SPECIAL');

CREATE TABLE special_ride_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id),
  stop_sequence integer NOT NULL CHECK (stop_sequence >= 1),
  point geography(Point,4326) NOT NULL,
  label text,
  dwell_minutes integer NOT NULL DEFAULT 0 CHECK (dwell_minutes BETWEEN 0 AND 240),
  status text NOT NULL DEFAULT 'PLANNED' CHECK
    (status IN ('PLANNED','APPROACHING','ARRIVED','SERVICED','SKIPPED')),
  UNIQUE(ride_id, stop_sequence)
);
CREATE INDEX special_ride_stops_ride_idx ON special_ride_stops(ride_id, stop_sequence);

-- Shared trip = one driver/vehicle, multiple passenger rides.
CREATE TABLE shared_trip_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  driver_id uuid REFERENCES drivers(id),
  vehicle_id uuid,
  seat_capacity integer NOT NULL CHECK (seat_capacity >= 1),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'FORMING' CHECK
    (status IN ('FORMING','ASSIGNED','ACTIVE','COMPLETED','CANCELLED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,driver_id) REFERENCES driver_tenant_authorizations(tenant_id,driver_id),
  FOREIGN KEY(tenant_id,vehicle_id) REFERENCES vehicles(tenant_id,id)
);
CREATE INDEX shared_groups_driver_status_idx ON shared_trip_groups(driver_id,status);

-- Must validate seat occupancy at each ordered route segment in locked group transaction.
CREATE TABLE shared_trip_bookings (
  ride_id uuid PRIMARY KEY REFERENCES rides(id),
  shared_group_id uuid NOT NULL REFERENCES shared_trip_groups(id),
  seats_requested integer NOT NULL CHECK (seats_requested >= 1),
  pickup_order integer NOT NULL CHECK (pickup_order >= 0),
  dropoff_order integer NOT NULL CHECK (dropoff_order > pickup_order),
  passenger_state text NOT NULL DEFAULT 'WAITING_PICKUP' CHECK
    (passenger_state IN ('WAITING_PICKUP','PICKED_UP','DROPPED_OFF','CANCELLED','NO_SHOW')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shared_bookings_group_idx ON shared_trip_bookings(shared_group_id,pickup_order,dropoff_order);

-- Authoritative one-driver engagement guard must be used by every private/pool assignment transaction.
-- In addition to this row, all ride transitions and worker claims must be integrated and tested.
CREATE TABLE driver_engagements (
  driver_id uuid PRIMARY KEY REFERENCES drivers(id),
  engagement_kind text NOT NULL CHECK (engagement_kind IN ('PRIVATE','SHARED')),
  private_ride_id uuid UNIQUE REFERENCES rides(id),
  shared_group_id uuid UNIQUE REFERENCES shared_trip_groups(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((engagement_kind = 'PRIVATE' AND private_ride_id IS NOT NULL AND shared_group_id IS NULL)
      OR (engagement_kind = 'SHARED' AND shared_group_id IS NOT NULL AND private_ride_id IS NULL))
);
-- IMPORTANT: Original `one_active_ride_per_driver` index still blocks multiple Shared passenger
-- rides per driver. Do not DROP it until code uses driver_engagements atomically everywhere.

-- Composite key required for tenant-safe linked ride FK below.
ALTER TABLE rides ADD CONSTRAINT rides_tenant_id_unique UNIQUE (tenant_id, id);

CREATE TABLE toda_reservation_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  terminal_id uuid NOT NULL,
  slot_kind text NOT NULL DEFAULT 'PASSENGER_PICKUP_WINDOW' CHECK
    (slot_kind = 'PASSENGER_PICKUP_WINDOW'),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK(capacity >= 1), -- BOOKING PARTIES, not seats or driver queue places
  policy_version text NOT NULL DEFAULT 'pilot-proposed',
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,terminal_id,id),
  FOREIGN KEY(tenant_id,terminal_id) REFERENCES terminals(tenant_id,id),
  CHECK(ends_at > starts_at)
);
CREATE INDEX toda_slots_terminal_start_idx ON toda_reservation_slots(tenant_id,terminal_id,starts_at);

CREATE TABLE toda_slot_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  terminal_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES app_users(id), -- passenger ONLY
  party_size integer NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 10),
  destination geography(Point,4326) NOT NULL,
  service_code text NOT NULL,
  pickup_landmark text,
  status text NOT NULL DEFAULT 'HELD' CHECK
    (status IN ('HELD','CONFIRMED','CHECKED_IN','DISPATCHING','ASSIGNED',
      'FULFILLED','CANCELLED','EXPIRED','NO_SHOW','UNFULFILLED','REJECTED','RESCHEDULED')),
  expires_at timestamptz, -- hold TTL, DB clock
  confirmed_at timestamptz,
  checkin_at timestamptz,
  dispatch_started_at timestamptz,
  assigned_at timestamptz,
  linked_ride_id uuid UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(slot_id,actor_user_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, linked_ride_id) REFERENCES rides(tenant_id, id),
  CHECK (status <> 'HELD' OR expires_at IS NOT NULL),
  CHECK (status NOT IN ('DISPATCHING','ASSIGNED','FULFILLED') OR linked_ride_id IS NOT NULL),
  FOREIGN KEY(tenant_id,terminal_id,slot_id)
    REFERENCES toda_reservation_slots(tenant_id,terminal_id,id)
);
CREATE INDEX toda_reservations_slot_status_idx ON toda_slot_reservations(slot_id,status);
-- Pilot: one live reservation per tenant/passenger. During reschedule mark the old
-- reservation RESCHEDULED before inserting a new HELD row in the SAME transaction.
CREATE UNIQUE INDEX toda_one_live_passenger_reservation_per_tenant
  ON toda_slot_reservations(tenant_id,actor_user_id)
  WHERE status IN ('HELD','CONFIRMED','CHECKED_IN','DISPATCHING','ASSIGNED');
-- A linked ride can appear at most once. A ride is not created by CONFIRMED alone.
-- All writes and TTL reconciliation use the DB clock and slot row lock.
-- Count HELD only when expires_at > transaction_timestamp(); counts also include
-- CONFIRMED,CHECKED_IN,DISPATCHING,ASSIGNED,FULFILLED (consumed historical capacity).
-- Cross-tenant linked rides are constrained by the tenant-scoped composite FK
-- and must still be verified to match passenger and terminal in service transactions.
-- Enforce passenger role from auth context; DB actor_user_id must equal JWT user.
-- Slot closure/changes and reservation state transitions require audit + outbox.
-- IMPORTANT: this remains a REFERENCE schema and must not be treated as a
-- migration of any already deployed v1.2 database without a reviewed upgrade plan.
