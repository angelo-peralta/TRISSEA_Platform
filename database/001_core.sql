-- TRISSEA PostgreSQL 17 + PostGIS reference schema, v1.0
-- DEV/STAGING DESIGN STARTER ONLY. Review permissions, RLS, migrations and policies before production.
-- Apply to an empty local database: psql -v ON_ERROR_STOP=1 -f database/001_core.sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_issuer text NOT NULL,
  auth_subject text NOT NULL,
  phone_e164 text,
  display_name text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_issuer, auth_subject)
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','SUSPENDED')),
  region_code text,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  role text NOT NULL CHECK (role IN ('TENANT_ADMIN','DISPATCHER','DRIVER','SUPPORT')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, role)
);

CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES app_users(id),
  license_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  plate_number text NOT NULL,
  service_code text NOT NULL,
  seats integer NOT NULL CHECK (seats >= 1),
  verification_status text NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, plate_number)
);

CREATE TABLE driver_tenant_authorizations (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  verification_status text NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING','VERIFIED','RESTRICTED','REJECTED')),
  verified_at timestamptz,
  verified_by uuid REFERENCES app_users(id),
  PRIMARY KEY (tenant_id, driver_id)
);

CREATE TABLE driver_vehicles (
  tenant_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (tenant_id, driver_id, vehicle_id),
  FOREIGN KEY (tenant_id, driver_id)
    REFERENCES driver_tenant_authorizations(tenant_id, driver_id),
  FOREIGN KEY (tenant_id, vehicle_id) REFERENCES vehicles(tenant_id, id)
);

CREATE TABLE service_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  service_code text NOT NULL,
  boundary geometry(MultiPolygon,4326) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);
CREATE INDEX service_zones_boundary_gix ON service_zones USING gist(boundary);

CREATE TABLE terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  terminal_point geography(Point,4326) NOT NULL,
  checkin_radius_m integer NOT NULL DEFAULT 100 CHECK (checkin_radius_m BETWEEN 20 AND 2000),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE INDEX terminals_point_gix ON terminals USING gist(terminal_point);

CREATE TABLE terminal_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  terminal_id uuid NOT NULL,
  service_code text NOT NULL,
  route_name text NOT NULL,
  capacity integer NOT NULL CHECK (capacity >= 1),
  active boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, terminal_id, id),
  FOREIGN KEY (tenant_id, terminal_id) REFERENCES terminals(tenant_id, id)
);

CREATE TABLE driver_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('ON_DEMAND','TERMINAL')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED','SUSPENDED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  FOREIGN KEY (tenant_id, driver_id, vehicle_id)
    REFERENCES driver_vehicles(tenant_id, driver_id, vehicle_id),
  UNIQUE (id, tenant_id, driver_id)
);
CREATE UNIQUE INDEX one_active_shift_per_driver ON driver_shifts(driver_id) WHERE status = 'ACTIVE';
CREATE INDEX active_shift_tenant_idx ON driver_shifts(tenant_id, mode) WHERE status = 'ACTIVE';

CREATE TABLE driver_last_positions (
  driver_id uuid PRIMARY KEY REFERENCES drivers(id),
  tenant_id uuid NOT NULL,
  position geography(Point,4326) NOT NULL,
  accuracy_m numeric(8,2) NOT NULL CHECK (accuracy_m >= 0),
  device_sequence bigint NOT NULL CHECK (device_sequence >= 0),
  captured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, driver_id)
    REFERENCES driver_tenant_authorizations(tenant_id, driver_id)
);
CREATE INDEX driver_last_positions_gix ON driver_last_positions USING gist(position);
CREATE INDEX driver_last_positions_tenant_time ON driver_last_positions(tenant_id, captured_at DESC);

CREATE TABLE terminal_queue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  terminal_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  route_id uuid,
  status text NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('WAITING','RESERVED','CONSUMED','LEFT','PAUSED')),
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  reserved_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, terminal_id) REFERENCES terminals(tenant_id, id),
  FOREIGN KEY (tenant_id, driver_id)
    REFERENCES driver_tenant_authorizations(tenant_id, driver_id),
  FOREIGN KEY (tenant_id, terminal_id, route_id)
    REFERENCES terminal_routes(tenant_id, terminal_id, id),
  FOREIGN KEY (shift_id, tenant_id, driver_id)
    REFERENCES driver_shifts(id, tenant_id, driver_id)
);
CREATE UNIQUE INDEX one_live_queue_per_driver ON terminal_queue_entries(driver_id)
  WHERE status IN ('WAITING','RESERVED');
CREATE INDEX terminal_fifo_idx ON terminal_queue_entries(tenant_id, terminal_id, enqueued_at, id)
  WHERE status = 'WAITING';

CREATE TABLE fare_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  service_code text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  base_centavos bigint NOT NULL DEFAULT 0 CHECK (base_centavos >= 0),
  per_km_centavos bigint NOT NULL DEFAULT 0 CHECK (per_km_centavos >= 0),
  per_minute_centavos bigint NOT NULL DEFAULT 0 CHECK (per_minute_centavos >= 0),
  fixed_terminal_centavos bigint,
  currency char(3) NOT NULL DEFAULT 'PHP' CHECK(currency = 'PHP'),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_code, version),
  UNIQUE (tenant_id, id)
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  passenger_id uuid NOT NULL REFERENCES app_users(id),
  mode text NOT NULL CHECK (mode IN ('ON_DEMAND','TERMINAL')),
  service_code text NOT NULL,
  fare_policy_id uuid NOT NULL,
  terminal_id uuid,
  terminal_route_id uuid,
  pickup geography(Point,4326) NOT NULL,
  dropoff geography(Point,4326) NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_centavos bigint NOT NULL CHECK (total_centavos >= 0),
  currency char(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, passenger_id),
  FOREIGN KEY (tenant_id, fare_policy_id) REFERENCES fare_policies(tenant_id, id),
  FOREIGN KEY (tenant_id, terminal_id) REFERENCES terminals(tenant_id, id),
  FOREIGN KEY (tenant_id, terminal_id, terminal_route_id)
    REFERENCES terminal_routes(tenant_id, terminal_id, id),
  CHECK (expires_at > created_at),
  CHECK ((mode = 'TERMINAL' AND terminal_id IS NOT NULL) OR (mode = 'ON_DEMAND' AND terminal_id IS NULL))
);
CREATE INDEX quote_passenger_idx ON quotes(passenger_id, created_at DESC);

CREATE TABLE rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  quote_id uuid NOT NULL UNIQUE,
  passenger_id uuid NOT NULL REFERENCES app_users(id),
  driver_id uuid REFERENCES drivers(id),
  mode text NOT NULL CHECK (mode IN ('ON_DEMAND','TERMINAL')),
  service_code text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','SEARCHING','DRIVER_ASSIGNED','DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED','FAILED')),
  pickup geography(Point,4326) NOT NULL,
  dropoff geography(Point,4326) NOT NULL,
  terminal_id uuid,
  total_centavos bigint NOT NULL CHECK (total_centavos >= 0),
  currency char(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  status_version integer NOT NULL DEFAULT 1 CHECK (status_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  FOREIGN KEY (tenant_id, quote_id, passenger_id) REFERENCES quotes(tenant_id, id, passenger_id),
  FOREIGN KEY (tenant_id, terminal_id) REFERENCES terminals(tenant_id, id),
  FOREIGN KEY (tenant_id, driver_id) REFERENCES driver_tenant_authorizations(tenant_id, driver_id),
  CHECK (status NOT IN ('DRIVER_ASSIGNED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED')
         OR driver_id IS NOT NULL),
  CHECK ((mode='TERMINAL' AND terminal_id IS NOT NULL) OR (mode='ON_DEMAND' AND terminal_id IS NULL))
);
CREATE UNIQUE INDEX one_active_ride_per_passenger ON rides(passenger_id)
  WHERE status IN ('REQUESTED','SEARCHING','DRIVER_ASSIGNED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS');
CREATE UNIQUE INDEX one_active_ride_per_driver ON rides(driver_id)
  WHERE driver_id IS NOT NULL AND status IN ('DRIVER_ASSIGNED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS');
CREATE INDEX rides_tenant_status_idx ON rides(tenant_id, status, created_at DESC);

CREATE TABLE ride_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  queue_entry_id uuid REFERENCES terminal_queue_entries(id),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','REVOKED')),
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  CHECK (expires_at > offered_at)
);
CREATE UNIQUE INDEX one_pending_offer_per_ride ON ride_offers(ride_id) WHERE status = 'PENDING';
CREATE UNIQUE INDEX one_pending_offer_per_driver ON ride_offers(driver_id) WHERE status = 'PENDING';
CREATE UNIQUE INDEX one_pending_offer_per_queue_entry ON ride_offers(queue_entry_id)
  WHERE status = 'PENDING' AND queue_entry_id IS NOT NULL;
CREATE INDEX offers_due_idx ON ride_offers(expires_at) WHERE status = 'PENDING';

CREATE TABLE ride_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES rides(id),
  actor_user_id uuid REFERENCES app_users(id),
  event_type text NOT NULL,
  previous_status text,
  next_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_events_ride_idx ON ride_events(ride_id, id);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  publish_attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX outbox_unpublished_idx ON outbox_events(created_at) WHERE published_at IS NULL;

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES app_users(id),
  endpoint text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (actor_user_id, endpoint, idempotency_key)
);
CREATE INDEX idempotency_expiry_idx ON idempotency_records(expires_at);

CREATE TABLE payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id),
  method text NOT NULL CHECK (method IN ('CASH','EWALLET','CARD')),
  status text NOT NULL CHECK (status IN ('UNPAID','PENDING','PAID','FAILED','REFUNDED','DISPUTED')),
  amount_centavos bigint NOT NULL CHECK (amount_centavos >= 0),
  currency char(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  provider text,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_reference)
);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  actor_user_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  trace_id text,
  change_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_tenant_time_idx ON audit_logs(tenant_id, created_at DESC);

COMMIT;
-- Database constraints are not the whole authorization system.
-- Production requires review of row security/permissions, service eligibility,
-- cross-entity tenant consistency, transition enforcement, retention and encryption.
