-- Synthetic verification only. Preserve general row versions and all 0001-0007 checksums.
-- A separate projection count keeps approval/terminal writes out of evidence snapshots.
CREATE TABLE identity.verification_projection_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_user_id uuid,affiliation_id uuid,vehicle_id uuid,relationship_id uuid,
 projection_count integer NOT NULL DEFAULT 1,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT verification_projection_profile FOREIGN KEY(profile_user_id) REFERENCES identity.driver_profiles(user_id),
 CONSTRAINT verification_projection_affiliation FOREIGN KEY(affiliation_id) REFERENCES identity.driver_toda_affiliations(id),
 CONSTRAINT verification_projection_vehicle FOREIGN KEY(vehicle_id) REFERENCES identity.driver_synthetic_vehicles(id),
 CONSTRAINT verification_projection_relationship FOREIGN KEY(relationship_id) REFERENCES identity.driver_vehicle_relationships(id),
 CONSTRAINT verification_projection_profile_once UNIQUE(profile_user_id),
 CONSTRAINT verification_projection_affiliation_once UNIQUE(affiliation_id),
 CONSTRAINT verification_projection_vehicle_once UNIQUE(vehicle_id),
 CONSTRAINT verification_projection_relationship_once UNIQUE(relationship_id),
 CONSTRAINT verification_projection_values CHECK(num_nonnulls(profile_user_id,affiliation_id,vehicle_id,relationship_id)=1 AND projection_count>0 AND source='SYNTHETIC_ONLY'));
ALTER TABLE identity.verification_projection_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.verification_projection_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON identity.verification_projection_versions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON identity.verification_projection_versions TO trissea_m2_verification_writer;
CREATE POLICY verification_projection_writer ON identity.verification_projection_versions TO trissea_m2_verification_writer USING(true) WITH CHECK(true);

CREATE FUNCTION identity.protect_verification_projection_version() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- Only a nested guarded projection may maintain counts; no caller-set GUC bypass.
 IF current_user<>'trissea_m2_verification_writer' OR pg_trigger_depth()<3 OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Projection metadata unavailable' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.projection_count<>1 THEN RAISE EXCEPTION 'Invalid initial projection count' USING ERRCODE='23514';END IF;
 ELSIF NEW.projection_count<>OLD.projection_count+1 OR (to_jsonb(NEW)-'projection_count') IS DISTINCT FROM (to_jsonb(OLD)-'projection_count') THEN
  RAISE EXCEPTION 'Immutable projection binding or stale count' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER verification_projection_version_guard BEFORE INSERT OR UPDATE OR DELETE ON identity.verification_projection_versions FOR EACH ROW EXECUTE FUNCTION identity.protect_verification_projection_version();

CREATE FUNCTION identity.record_verification_projection_version() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- project_verification_decision is SECURITY DEFINER under this NOLOGIN role.
 -- Ordinary owner/runtime target revisions receive no credit and remain stale.
 IF current_user<>'trissea_m2_verification_writer' THEN RETURN NULL;END IF;
 IF TG_TABLE_NAME='driver_profiles' THEN
  INSERT INTO identity.verification_projection_versions(profile_user_id) VALUES(NEW.user_id) ON CONFLICT(profile_user_id) DO UPDATE SET projection_count=identity.verification_projection_versions.projection_count+1;
 ELSIF TG_TABLE_NAME='driver_toda_affiliations' THEN
  INSERT INTO identity.verification_projection_versions(affiliation_id) VALUES(NEW.id) ON CONFLICT(affiliation_id) DO UPDATE SET projection_count=identity.verification_projection_versions.projection_count+1;
 ELSIF TG_TABLE_NAME='driver_synthetic_vehicles' THEN
  INSERT INTO identity.verification_projection_versions(vehicle_id) VALUES(NEW.id) ON CONFLICT(vehicle_id) DO UPDATE SET projection_count=identity.verification_projection_versions.projection_count+1;
 ELSIF TG_TABLE_NAME='driver_vehicle_relationships' THEN
  INSERT INTO identity.verification_projection_versions(relationship_id) VALUES(NEW.id) ON CONFLICT(relationship_id) DO UPDATE SET projection_count=identity.verification_projection_versions.projection_count+1;
 ELSE RAISE EXCEPTION 'Unknown projection target' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['driver_profiles','driver_toda_affiliations','driver_synthetic_vehicles','driver_vehicle_relationships'] LOOP
  EXECUTE format('CREATE TRIGGER verification_projection_version AFTER UPDATE ON identity.%I FOR EACH ROW EXECUTE FUNCTION identity.record_verification_projection_version()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION identity.verification_target(p_relationship uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r identity.driver_vehicle_relationships;p identity.driver_profiles;a identity.driver_toda_affiliations;v identity.driver_synthetic_vehicles;s identity.driver_intake_scopes;c identity.verification_cases;
BEGIN
 SELECT * INTO r FROM identity.driver_vehicle_relationships WHERE id=p_relationship;IF NOT FOUND THEN RAISE EXCEPTION 'Verification target unavailable' USING ERRCODE='42501';END IF;
 IF current_setting('trissea.client_purpose',true)='DRIVER' THEN
  IF r.user_id::text IS DISTINCT FROM current_setting('trissea.user_id',true) THEN RAISE EXCEPTION 'Verification target unavailable' USING ERRCODE='42501';END IF;
 ELSE
  SELECT * INTO c FROM identity.verification_cases WHERE id=nullif(current_setting('trissea.verification_case_id',true),'')::uuid AND relationship_id=r.id;
  IF NOT FOUND OR NOT identity.verification_visible(c.id) OR current_setting('trissea.client_purpose',true) IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION 'Verification target unavailable' USING ERRCODE='42501';END IF;
 END IF;
 PERFORM id FROM identity.app_users WHERE id=r.user_id AND state='ACTIVE' FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'Applicant unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM identity.driver_profiles WHERE user_id=r.user_id FOR UPDATE;
 SELECT * INTO s FROM identity.driver_intake_scopes WHERE city_tenant_id=r.city_tenant_id AND toda_id=r.toda_id FOR SHARE;
 SELECT * INTO a FROM identity.driver_toda_affiliations WHERE id=r.affiliation_id FOR UPDATE;
 SELECT * INTO r FROM identity.driver_vehicle_relationships WHERE id=p_relationship FOR UPDATE;
 SELECT * INTO v FROM identity.driver_synthetic_vehicles WHERE id=r.vehicle_id FOR UPDATE;
 PERFORM id FROM identity.city_tenants WHERE id=r.city_tenant_id AND state='ACTIVE' FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'City unavailable' USING ERRCODE='42501';END IF;
 PERFORM id FROM identity.toda_organizations WHERE id=r.toda_id AND city_tenant_id=r.city_tenant_id AND state='VERIFIED' FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'TODA unavailable' USING ERRCODE='42501';END IF;
 IF p.source<>'SYNTHETIC_ONLY' OR a.source<>'SYNTHETIC_ONLY' OR v.source<>'SYNTHETIC_ONLY' OR r.source<>'SYNTHETIC_ONLY' OR s.source<>'SYNTHETIC_ONLY' OR s.state<>'OPEN' OR p.state='SUSPENDED' OR a.state='SUSPENDED' OR v.state='SUSPENDED' OR r.state='SUSPENDED' THEN RAISE EXCEPTION 'Synthetic intake unavailable' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('userId',r.user_id,'cityTenantId',r.city_tenant_id,'todaId',r.toda_id,'relationshipId',r.id,'profileVersion',p.version-coalesce((SELECT projection_count FROM identity.verification_projection_versions WHERE profile_user_id=p.user_id),0),'affiliationVersion',a.version-coalesce((SELECT projection_count FROM identity.verification_projection_versions WHERE affiliation_id=a.id),0),'vehicleVersion',v.version-coalesce((SELECT projection_count FROM identity.verification_projection_versions WHERE vehicle_id=v.id),0),'relationshipVersion',r.version-coalesce((SELECT projection_count FROM identity.verification_projection_versions WHERE relationship_id=r.id),0),'intakeVersion',s.version,'policyReference',s.policy_reference);
END $$;
-- Replacement preserves the existing verification_target owner/grants and locks.
GRANT CREATE ON SCHEMA identity TO trissea_m2_verification_writer;
ALTER FUNCTION identity.protect_verification_projection_version() OWNER TO trissea_m2_verification_writer;
ALTER FUNCTION identity.record_verification_projection_version() OWNER TO trissea_m2_verification_writer;
REVOKE CREATE ON SCHEMA identity FROM trissea_m2_verification_writer;
REVOKE ALL ON FUNCTION identity.protect_verification_projection_version(),identity.record_verification_projection_version() FROM PUBLIC;
