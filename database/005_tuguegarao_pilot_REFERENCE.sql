-- REFERENCE-ONLY EXTENSION. DO NOT APPLY TO PRODUCTION WITHOUT REVIEW.
-- Requires database/001_core.sql and existing gen_random_uuid()/PostGIS.
-- Does not import uploaded screenshots as approved fares.
BEGIN;
CREATE TABLE IF NOT EXISTS toda_organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 code text NOT NULL,
 legal_name text NOT NULL,
 verification_status text NOT NULL DEFAULT 'PENDING'
  CHECK (verification_status IN ('PENDING','VERIFIED','SUSPENDED','REJECTED')),
 permitted_zone_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE IF NOT EXISTS toda_driver_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 toda_id uuid NOT NULL,
 driver_id uuid NOT NULL REFERENCES drivers(id),
 status text NOT NULL DEFAULT 'PENDING'
  CHECK(status IN ('PENDING','VERIFIED','SUSPENDED','REVOKED')),
 verified_by uuid REFERENCES app_users(id),
 verified_at timestamptz,
 UNIQUE(tenant_id,toda_id,driver_id),
 FOREIGN KEY(tenant_id,toda_id) REFERENCES toda_organizations(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS fare_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 source_name text NOT NULL,
 reference_number text,
 signed_on date,
 effective_on date,
 document_storage_key text,
 source_status text NOT NULL DEFAULT 'UNVERIFIED'
  CHECK(source_status IN ('UNVERIFIED','VERIFIED','WITHDRAWN')),
 legal_review_by uuid REFERENCES app_users(id),
 legal_reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS fare_policies_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 source_id uuid NOT NULL,
 policy_name text NOT NULL,
 service_code text NOT NULL CHECK(service_code IN ('REGULAR','SHARED','SPECIAL','RESERVATION')),
 toda_id uuid,
 version integer NOT NULL CHECK(version>=1),
 state text NOT NULL DEFAULT 'DRAFT_UNVERIFIED'
  CHECK(state IN ('DRAFT_UNVERIFIED','UNDER_REVIEW','APPROVED_SCHEDULED','ACTIVE','SUPERSEDED','REJECTED')),
 effective_from timestamptz,
 effective_to timestamptz,
 drafted_by uuid NOT NULL REFERENCES app_users(id),
 approved_by uuid REFERENCES app_users(id),
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(approved_by IS NULL OR approved_by<>drafted_by),
 CHECK(state<>'ACTIVE' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND effective_from IS NOT NULL)),
 UNIQUE(tenant_id,service_code,toda_id,version),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,source_id) REFERENCES fare_sources(tenant_id,id),
 FOREIGN KEY(tenant_id,toda_id) REFERENCES toda_organizations(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS fare_rules_v2 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 policy_id uuid NOT NULL,
 origin_area_code text,    -- NULL = UNKNOWN from screenshot; NOT priceable
 destination_area_code text NOT NULL,
 passenger_fare_category text NOT NULL CHECK(passenger_fare_category IN ('REGULAR','STUDENT_SENIOR_PWD')),
 pricing_unit text NOT NULL CHECK(pricing_unit IN ('PER_SEAT','WHOLE_UNIT','APPROVED_FIXED_TRIP')),
 amount_centavos bigint NOT NULL CHECK(amount_centavos>=0),
 directionality text NOT NULL DEFAULT 'UNVERIFIED'
  CHECK(directionality IN ('UNVERIFIED','ONE_WAY','BIDIRECTIONAL')),
 legal_vehicle_seats_basis integer CHECK(legal_vehicle_seats_basis IS NULL OR legal_vehicle_seats_basis >= 1),
 is_production_priceable boolean NOT NULL DEFAULT false,
 note text,
 UNIQUE(policy_id,origin_area_code,destination_area_code,passenger_fare_category,pricing_unit),
 FOREIGN KEY(tenant_id,policy_id) REFERENCES fare_policies_v2(tenant_id,id),
 CHECK(is_production_priceable=false OR (origin_area_code IS NOT NULL AND directionality<>'UNVERIFIED'))
);
CREATE INDEX IF NOT EXISTS fare_rules_v2_lookup
 ON fare_rules_v2(tenant_id,policy_id,destination_area_code,passenger_fare_category);
CREATE TABLE IF NOT EXISTS fare_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 policy_id uuid NOT NULL,
 requested_by uuid NOT NULL REFERENCES app_users(id),
 change_reason text NOT NULL,
 before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 after_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'SUBMITTED'
  CHECK(status IN ('SUBMITTED','APPROVED','REJECTED','CANCELLED')),
 reviewed_by uuid REFERENCES app_users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(reviewed_by IS NULL OR reviewed_by<>requested_by),
 FOREIGN KEY(tenant_id,policy_id) REFERENCES fare_policies_v2(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS quote_fare_snapshots (
 quote_id uuid PRIMARY KEY REFERENCES quotes(id),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 fare_policy_v2_id uuid,
 fare_source_id uuid,
 ride_option text NOT NULL CHECK(ride_option IN ('REGULAR','SHARED','SPECIAL','RESERVATION')),
 pricing_unit text,
 seats_charged integer,
 source_components jsonb NOT NULL DEFAULT '{}'::jsonb,
 approval_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 amount_centavos bigint NOT NULL CHECK(amount_centavos >= 0),
 captured_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,fare_policy_v2_id) REFERENCES fare_policies_v2(tenant_id,id),
 FOREIGN KEY(tenant_id,fare_source_id) REFERENCES fare_sources(tenant_id,id)
);
-- The application MUST enforce under SERIALIZABLE or equivalent scoped locking:
--   (1) no overlapping ACTIVE fare policies for same TODA/zone/service/validity;
--   (2) only signed VERIFIED legal sources allow ACTIVE state;
--   (3) no maker approval of own fare policy;
--   (4) quote must reference a priceable approved line and immutable snapshot.
-- These require triggers/constraints + integration tests before any production migration.
COMMIT;
