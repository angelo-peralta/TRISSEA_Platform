-- Disposable fixtures only: removes derived counts, not prior cases/evidence/facts.
-- Populated operational rollback requires separate review; pending snapshots must
-- not be reused after dropping projection counts. Use a forward repair instead.
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['driver_profiles','driver_toda_affiliations','driver_synthetic_vehicles','driver_vehicle_relationships'] LOOP
  EXECUTE format('DROP TRIGGER verification_projection_version ON identity.%I',t);
 END LOOP;
END $$;
DROP FUNCTION identity.record_verification_projection_version();
DROP TRIGGER verification_projection_version_guard ON identity.verification_projection_versions;
DROP FUNCTION identity.protect_verification_projection_version();
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
 RETURN jsonb_build_object('userId',r.user_id,'cityTenantId',r.city_tenant_id,'todaId',r.toda_id,'relationshipId',r.id,'profileVersion',p.version,'affiliationVersion',a.version,'vehicleVersion',v.version,'relationshipVersion',r.version,'intakeVersion',s.version,'policyReference',s.policy_reference);
END $$;
DROP TABLE identity.verification_projection_versions;
