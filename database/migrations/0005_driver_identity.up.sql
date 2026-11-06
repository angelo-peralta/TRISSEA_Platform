-- M2.4 local/synthetic driver intake, not legal approval or operational authority.
CREATE TABLE identity.driver_profiles(
 user_id uuid PRIMARY KEY, state text NOT NULL DEFAULT 'PENDING',version integer NOT NULL DEFAULT 1,
 verification_reference uuid,valid_until timestamptz,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT driver_profile_user FOREIGN KEY(user_id) REFERENCES identity.app_users(id),
 CONSTRAINT driver_profile_values CHECK(state IN ('PENDING','VERIFIED','REJECTED','SUSPENDED','REVOKED','EXPIRED') AND version>0 AND source='SYNTHETIC_ONLY' AND (state<>'VERIFIED' OR (verification_reference IS NOT NULL AND valid_until IS NOT NULL))));
CREATE TABLE identity.driver_intake_scopes(
 city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,state text NOT NULL DEFAULT 'CLOSED',policy_reference uuid NOT NULL,
 version integer NOT NULL DEFAULT 1,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),city_label text NOT NULL,toda_label text NOT NULL,
 PRIMARY KEY(city_tenant_id,toda_id),CONSTRAINT driver_intake_toda FOREIGN KEY(city_tenant_id,toda_id) REFERENCES identity.toda_organizations(city_tenant_id,id),
 CONSTRAINT driver_intake_values CHECK(state IN ('OPEN','CLOSED') AND version>0 AND source='SYNTHETIC_ONLY' AND city_label ~ '^SYNTHETIC_[A-Z0-9_]{1,32}$' AND toda_label ~ '^SYNTHETIC_[A-Z0-9_]{1,32}$'));
CREATE TABLE identity.driver_toda_affiliations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'PENDING',version integer NOT NULL DEFAULT 1,verification_reference uuid,valid_until timestamptz,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT driver_affiliation_profile FOREIGN KEY(user_id) REFERENCES identity.driver_profiles(user_id),
 CONSTRAINT driver_affiliation_scope FOREIGN KEY(city_tenant_id,toda_id) REFERENCES identity.driver_intake_scopes(city_tenant_id,toda_id),
 CONSTRAINT driver_affiliation_binding UNIQUE(id,user_id,city_tenant_id,toda_id),CONSTRAINT driver_affiliation_once UNIQUE(user_id,city_tenant_id,toda_id),
 CONSTRAINT driver_affiliation_values CHECK(state IN ('PENDING','VERIFIED','REJECTED','SUSPENDED','REVOKED','EXPIRED') AND version>0 AND source='SYNTHETIC_ONLY' AND (state<>'VERIFIED' OR (verification_reference IS NOT NULL AND valid_until IS NOT NULL))));
CREATE INDEX driver_affiliation_queue_idx ON identity.driver_toda_affiliations(city_tenant_id,toda_id,state);
CREATE TABLE identity.driver_synthetic_vehicles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,reference_code text NOT NULL,
 state text NOT NULL DEFAULT 'PENDING',seat_capacity integer,version integer NOT NULL DEFAULT 1,verification_reference uuid,valid_until timestamptz,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT driver_vehicle_scope FOREIGN KEY(city_tenant_id,toda_id) REFERENCES identity.driver_intake_scopes(city_tenant_id,toda_id),
 CONSTRAINT driver_vehicle_binding UNIQUE(id,city_tenant_id,toda_id),CONSTRAINT driver_vehicle_reference UNIQUE(city_tenant_id,toda_id,reference_code),
 CONSTRAINT driver_vehicle_values CHECK(state IN ('PENDING','VERIFIED','SUSPENDED','REVOKED','EXPIRED') AND version>0 AND source='SYNTHETIC_ONLY' AND reference_code ~ '^SYNTHETIC_[A-Z0-9_]{1,32}$' AND (seat_capacity IS NULL OR seat_capacity>0) AND (state<>'VERIFIED' OR (verification_reference IS NOT NULL AND valid_until IS NOT NULL AND seat_capacity IS NOT NULL))));
CREATE TABLE identity.driver_vehicle_relationships(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,affiliation_id uuid NOT NULL,vehicle_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'PENDING',version integer NOT NULL DEFAULT 1,verification_reference uuid,valid_until timestamptz,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT driver_relationship_affiliation FOREIGN KEY(affiliation_id,user_id,city_tenant_id,toda_id) REFERENCES identity.driver_toda_affiliations(id,user_id,city_tenant_id,toda_id),
 CONSTRAINT driver_relationship_vehicle FOREIGN KEY(vehicle_id,city_tenant_id,toda_id) REFERENCES identity.driver_synthetic_vehicles(id,city_tenant_id,toda_id),
 CONSTRAINT driver_relationship_binding UNIQUE(id,user_id,city_tenant_id,toda_id),CONSTRAINT driver_relationship_once UNIQUE(user_id,city_tenant_id,toda_id,vehicle_id),
 CONSTRAINT driver_relationship_values CHECK(state IN ('PENDING','VERIFIED','REJECTED','SUSPENDED','REVOKED','EXPIRED') AND version>0 AND source='SYNTHETIC_ONLY' AND (state<>'VERIFIED' OR (verification_reference IS NOT NULL AND valid_until IS NOT NULL))));
CREATE TABLE identity.driver_scope_assertions(
 user_id uuid NOT NULL,city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,relationship_id uuid NOT NULL,
 profile_version integer NOT NULL,affiliation_version integer NOT NULL,vehicle_version integer NOT NULL,relationship_version integer NOT NULL,intake_version integer NOT NULL,
 permit_reference uuid NOT NULL,policy_reference uuid NOT NULL,policy_version integer NOT NULL,effective_from timestamptz NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,
 version integer NOT NULL DEFAULT 1,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,city_tenant_id,toda_id),
 CONSTRAINT driver_assertion_relationship FOREIGN KEY(relationship_id,user_id,city_tenant_id,toda_id) REFERENCES identity.driver_vehicle_relationships(id,user_id,city_tenant_id,toda_id),
 CONSTRAINT driver_assertion_values CHECK(profile_version>0 AND affiliation_version>0 AND vehicle_version>0 AND relationship_version>0 AND intake_version>0 AND policy_version>0 AND version>0 AND source='SYNTHETIC_ONLY' AND expires_at>effective_from AND (revoked_at IS NULL OR revoked_at>=created_at)));
CREATE TABLE identity.driver_request_receipts(
 user_id uuid NOT NULL,operation text NOT NULL,key_digest text NOT NULL,request_digest text NOT NULL,resource_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,operation,key_digest),CONSTRAINT driver_receipt_user FOREIGN KEY(user_id) REFERENCES identity.app_users(id),
 CONSTRAINT driver_receipt_values CHECK(operation IN ('AFFILIATION','VEHICLE') AND key_digest ~ '^[0-9a-f]{64}$' AND request_digest ~ '^[0-9a-f]{64}$'));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['driver_profiles','driver_toda_affiliations','driver_vehicle_relationships','driver_scope_assertions','driver_request_receipts'] LOOP
  EXECUTE format('ALTER TABLE identity.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE identity.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC',t);
  EXECUTE format('CREATE POLICY driver_owner ON identity.%I TO trissea_m2_auth USING(user_id::text=current_setting(''trissea.user_id'',true) AND current_setting(''trissea.client_purpose'',true)=''DRIVER'') WITH CHECK(user_id::text=current_setting(''trissea.user_id'',true) AND current_setting(''trissea.client_purpose'',true)=''DRIVER'')',t);
  EXECUTE format('GRANT SELECT ON identity.%I TO trissea_m2_auth',t);
 END LOOP;
END $$;
-- Dedicated lock function owner, never a table owner or a role available to runtime SET ROLE.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_driver_lock') THEN CREATE ROLE trissea_m2_driver_lock NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_driver_lock' AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit))
 OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='trissea_m2_driver_lock')) THEN RAISE EXCEPTION 'Unsafe driver lock role'; END IF;
END $$;
GRANT USAGE ON SCHEMA identity TO trissea_m2_driver_lock;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['driver_profiles','driver_intake_scopes','driver_toda_affiliations','driver_synthetic_vehicles','driver_vehicle_relationships','driver_scope_assertions'] LOOP
  EXECUTE format('GRANT SELECT,UPDATE(version) ON identity.%I TO trissea_m2_driver_lock',t);
  EXECUTE format('CREATE POLICY driver_lock ON identity.%I TO trissea_m2_driver_lock USING(true) WITH CHECK(false)',t);
 END LOOP;
END $$;
CREATE FUNCTION identity.lock_driver_context(p_user uuid,p_city uuid,p_toda uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_user::text IS DISTINCT FROM current_setting('trissea.user_id',true) OR current_setting('trissea.client_purpose',true) IS DISTINCT FROM 'DRIVER'
 OR coalesce(p_city::text,'') IS DISTINCT FROM current_setting('trissea.city_tenant_id',true) OR coalesce(p_toda::text,'') IS DISTINCT FROM current_setting('trissea.toda_id',true)
 OR (p_city IS NULL) IS DISTINCT FROM (p_toda IS NULL) THEN RAISE EXCEPTION 'Invalid driver lock context' USING ERRCODE='42501'; END IF;
 PERFORM user_id FROM identity.driver_profiles WHERE user_id=p_user FOR SHARE;
 IF p_city IS NOT NULL THEN
  PERFORM toda_id FROM identity.driver_intake_scopes WHERE city_tenant_id=p_city AND toda_id=p_toda FOR SHARE;
  PERFORM id FROM identity.driver_toda_affiliations WHERE user_id=p_user AND city_tenant_id=p_city AND toda_id=p_toda ORDER BY id FOR SHARE;
  PERFORM id FROM identity.driver_vehicle_relationships WHERE user_id=p_user AND city_tenant_id=p_city AND toda_id=p_toda ORDER BY id FOR SHARE;
  PERFORM id FROM identity.driver_synthetic_vehicles WHERE city_tenant_id=p_city AND toda_id=p_toda ORDER BY id FOR SHARE;
  PERFORM user_id FROM identity.driver_scope_assertions WHERE user_id=p_user AND city_tenant_id=p_city AND toda_id=p_toda FOR SHARE;
 END IF;
END $$;
GRANT CREATE ON SCHEMA identity TO trissea_m2_driver_lock;
ALTER FUNCTION identity.lock_driver_context(uuid,uuid,uuid) OWNER TO trissea_m2_driver_lock;
REVOKE CREATE ON SCHEMA identity FROM trissea_m2_driver_lock;
REVOKE ALL ON FUNCTION identity.lock_driver_context(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lock_driver_context(uuid,uuid,uuid) TO trissea_m2_auth;
ALTER TABLE identity.driver_intake_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.driver_intake_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.driver_synthetic_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.driver_synthetic_vehicles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON identity.driver_intake_scopes,identity.driver_synthetic_vehicles FROM PUBLIC;
CREATE POLICY driver_intake_read ON identity.driver_intake_scopes FOR SELECT TO trissea_m2_auth USING(current_setting('trissea.client_purpose',true)='DRIVER');
CREATE POLICY driver_fixture_read ON identity.driver_synthetic_vehicles FOR SELECT TO trissea_m2_auth USING(current_setting('trissea.client_purpose',true)='DRIVER');
GRANT SELECT ON identity.driver_intake_scopes,identity.driver_synthetic_vehicles TO trissea_m2_auth;
-- A runtime INSERT cannot specify approval, capacity, policy or verification fields.
GRANT INSERT(user_id) ON identity.driver_profiles TO trissea_m2_auth;
GRANT INSERT(user_id,city_tenant_id,toda_id) ON identity.driver_toda_affiliations TO trissea_m2_auth;
GRANT INSERT(user_id,city_tenant_id,toda_id,affiliation_id,vehicle_id) ON identity.driver_vehicle_relationships TO trissea_m2_auth;
GRANT INSERT ON identity.driver_request_receipts TO trissea_m2_auth;
CREATE TRIGGER driver_receipt_immutable BEFORE UPDATE OR DELETE ON identity.driver_request_receipts FOR EACH ROW EXECUTE FUNCTION identity.reject_mutation();
-- All mutable test assertions are owner-only; preserve subject/scope binding and explicit versions.
CREATE FUNCTION identity.protect_driver_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','verification_reference','valid_until','revoked_at','expires_at','effective_from','profile_version','affiliation_version','vehicle_version','relationship_version','intake_version','policy_version','permit_reference','policy_reference','seat_capacity'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','verification_reference','valid_until','revoked_at','expires_at','effective_from','profile_version','affiliation_version','vehicle_version','relationship_version','intake_version','policy_version','permit_reference','policy_reference','seat_capacity'])
 THEN RAISE EXCEPTION 'Immutable driver binding or stale version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['driver_profiles','driver_intake_scopes','driver_toda_affiliations','driver_synthetic_vehicles','driver_vehicle_relationships','driver_scope_assertions'] LOOP
  EXECUTE format('CREATE TRIGGER driver_binding BEFORE UPDATE ON identity.%I FOR EACH ROW EXECUTE FUNCTION identity.protect_driver_binding()',t);
 END LOOP;
END $$;
