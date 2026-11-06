-- Local synthetic verification only. No documents, storage URLs, permits or operating authority.
CREATE TABLE identity.verification_evidence_heads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,relationship_id uuid NOT NULL,kind text NOT NULL,current_version integer NOT NULL,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT verification_head_relationship FOREIGN KEY(relationship_id,user_id,city_tenant_id,toda_id) REFERENCES identity.driver_vehicle_relationships(id,user_id,city_tenant_id,toda_id),
 CONSTRAINT verification_head_binding UNIQUE(id,user_id,city_tenant_id,toda_id,relationship_id,kind),
 CONSTRAINT verification_head_values CHECK(kind IN ('DRIVER','VEHICLE','TODA_MEMBERSHIP') AND current_version>0 AND source='SYNTHETIC_ONLY'));
CREATE TABLE identity.verification_evidence_versions(
 evidence_id uuid NOT NULL,evidence_version integer NOT NULL,digest text NOT NULL,reference_code text NOT NULL,seat_capacity integer,valid_until timestamptz NOT NULL,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(evidence_id,evidence_version),CONSTRAINT verification_evidence_head FOREIGN KEY(evidence_id) REFERENCES identity.verification_evidence_heads(id),
 CONSTRAINT verification_evidence_values CHECK(evidence_version>0 AND digest ~ '^[0-9a-f]{64}$' AND reference_code ~ '^SYNTHETIC_[A-Z0-9_]{1,32}$' AND (seat_capacity IS NULL OR seat_capacity>0) AND valid_until>created_at AND source='SYNTHETIC_ONLY'));
CREATE TABLE identity.verification_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,relationship_id uuid NOT NULL,kind text NOT NULL,state text NOT NULL DEFAULT 'DRAFT',version integer NOT NULL DEFAULT 1,current_round integer NOT NULL DEFAULT 0,assignment_version integer,last_decision_id uuid,valid_until timestamptz,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT verification_case_relationship FOREIGN KEY(relationship_id,user_id,city_tenant_id,toda_id) REFERENCES identity.driver_vehicle_relationships(id,user_id,city_tenant_id,toda_id),
 CONSTRAINT verification_case_once UNIQUE(user_id,city_tenant_id,toda_id,relationship_id,kind),CONSTRAINT verification_case_binding UNIQUE(id,user_id,city_tenant_id,toda_id,relationship_id,kind),
 CONSTRAINT verification_case_values CHECK(kind IN ('DRIVER','VEHICLE','TODA_MEMBERSHIP') AND state IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','REVOKED','EXPIRED') AND version>0 AND current_round>=0 AND (assignment_version IS NULL OR assignment_version>0) AND (state<>'DRAFT' OR current_round=0) AND (state='DRAFT' OR current_round>0) AND (state NOT IN ('APPROVED','REVOKED','EXPIRED') OR (last_decision_id IS NOT NULL AND valid_until IS NOT NULL)) AND source='SYNTHETIC_ONLY'));
CREATE INDEX verification_case_queue_idx ON identity.verification_cases(city_tenant_id,toda_id,kind,state,id);
CREATE TABLE identity.verification_submissions(
 case_id uuid NOT NULL,round integer NOT NULL,user_id uuid NOT NULL,city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,relationship_id uuid NOT NULL,kind text NOT NULL,evidence_id uuid NOT NULL,evidence_version integer NOT NULL,profile_version integer NOT NULL,affiliation_version integer NOT NULL,vehicle_version integer NOT NULL,relationship_version integer NOT NULL,intake_version integer NOT NULL,policy_reference uuid NOT NULL,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(case_id,round),CONSTRAINT verification_submission_case FOREIGN KEY(case_id,user_id,city_tenant_id,toda_id,relationship_id,kind) REFERENCES identity.verification_cases(id,user_id,city_tenant_id,toda_id,relationship_id,kind),
 CONSTRAINT verification_submission_head FOREIGN KEY(evidence_id,user_id,city_tenant_id,toda_id,relationship_id,kind) REFERENCES identity.verification_evidence_heads(id,user_id,city_tenant_id,toda_id,relationship_id,kind),
 CONSTRAINT verification_submission_evidence FOREIGN KEY(evidence_id,evidence_version) REFERENCES identity.verification_evidence_versions(evidence_id,evidence_version),
 CONSTRAINT verification_submission_values CHECK(round>0 AND evidence_version>0 AND profile_version>0 AND affiliation_version>0 AND vehicle_version>0 AND relationship_version>0 AND intake_version>0 AND source='SYNTHETIC_ONLY'));
CREATE TABLE identity.verification_assignments(
 case_id uuid NOT NULL,assignment_version integer NOT NULL,user_id uuid NOT NULL,city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,relationship_id uuid NOT NULL,kind text NOT NULL,reviewer_user_id uuid NOT NULL,assigned_by uuid NOT NULL,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT verification_assignment_reviewer FOREIGN KEY(reviewer_user_id) REFERENCES identity.app_users(id),CONSTRAINT verification_assignment_authority FOREIGN KEY(assigned_by) REFERENCES identity.app_users(id),
 PRIMARY KEY(case_id,assignment_version),CONSTRAINT verification_assignment_case FOREIGN KEY(case_id,user_id,city_tenant_id,toda_id,relationship_id,kind) REFERENCES identity.verification_cases(id,user_id,city_tenant_id,toda_id,relationship_id,kind),
 CONSTRAINT verification_assignment_city FOREIGN KEY(reviewer_user_id,city_tenant_id) REFERENCES identity.city_memberships(user_id,city_tenant_id),
 CONSTRAINT verification_assignment_values CHECK(assignment_version>0 AND reviewer_user_id<>user_id AND assigned_by<>user_id AND assigned_by<>reviewer_user_id AND source='SYNTHETIC_ONLY'));
CREATE INDEX verification_reviewer_queue_idx ON identity.verification_assignments(reviewer_user_id,case_id);
CREATE TABLE identity.verification_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL,round integer NOT NULL,expected_version integer NOT NULL,evidence_version integer NOT NULL,actor_user_id uuid NOT NULL,actor_session_id uuid NOT NULL,outcome text NOT NULL,reason_code text NOT NULL,previous_decision_id uuid,valid_until timestamptz,source text NOT NULL DEFAULT 'SYNTHETIC_ONLY',created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT verification_decision_submission FOREIGN KEY(case_id,round) REFERENCES identity.verification_submissions(case_id,round),
 CONSTRAINT verification_decision_actor FOREIGN KEY(actor_session_id,actor_user_id) REFERENCES identity.app_sessions(id,user_id),
 CONSTRAINT verification_decision_values CHECK(round>0 AND expected_version>0 AND evidence_version>0 AND outcome IN ('APPROVE','REJECT','REVOKE','EXPIRE') AND reason_code IN ('SYNTHETIC_ACCEPTED','SYNTHETIC_INCOMPLETE','SYNTHETIC_MISMATCH','SYNTHETIC_WITHDRAWN','SYNTHETIC_EXPIRED') AND (outcome NOT IN ('APPROVE','REVOKE','EXPIRE') OR valid_until IS NOT NULL) AND source='SYNTHETIC_ONLY'));
CREATE UNIQUE INDEX verification_initial_decision_once ON identity.verification_decisions(case_id,round) WHERE outcome IN ('APPROVE','REJECT');
CREATE UNIQUE INDEX verification_terminal_decision_once ON identity.verification_decisions(case_id,round) WHERE outcome IN ('REVOKE','EXPIRE');
CREATE TABLE identity.verification_receipts(
 actor_user_id uuid NOT NULL,operation text NOT NULL,key_digest text NOT NULL,request_digest text NOT NULL,case_id uuid NOT NULL,response_ciphertext text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_user_id,operation,key_digest),
 CONSTRAINT verification_receipt_actor FOREIGN KEY(actor_user_id) REFERENCES identity.app_users(id),CONSTRAINT verification_receipt_case FOREIGN KEY(case_id) REFERENCES identity.verification_cases(id),
 CONSTRAINT verification_receipt_values CHECK(operation IN ('OPEN','SUBMIT','DECISION') AND key_digest ~ '^[0-9a-f]{64}$' AND request_digest ~ '^[0-9a-f]{64}$' AND response_ciphertext LIKE 'v1.%'));

DO $$ DECLARE r text;t text; BEGIN
 FOREACH r IN ARRAY ARRAY['trissea_m2_verification','trissea_m2_verification_writer'] LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',r); END IF;
  IF EXISTS(SELECT FROM pg_roles WHERE rolname=r AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit)) OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=r)) THEN RAISE EXCEPTION 'Unsafe verification role'; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['verification_evidence_heads','verification_evidence_versions','verification_cases','verification_submissions','verification_assignments','verification_decisions','verification_receipts'] LOOP
  EXECUTE format('ALTER TABLE identity.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE identity.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC',t);
  EXECUTE format('GRANT SELECT ON identity.%I TO trissea_m2_verification',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON identity.%I TO trissea_m2_verification_writer',t);
  EXECUTE format('CREATE POLICY verification_writer ON identity.%I TO trissea_m2_verification_writer USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA identity TO trissea_m2_verification,trissea_m2_verification_writer;
GRANT INSERT(user_id,city_tenant_id,toda_id,relationship_id,kind) ON identity.verification_cases TO trissea_m2_verification;
GRANT UPDATE(state,version,current_round,last_decision_id,valid_until) ON identity.verification_cases TO trissea_m2_verification;
GRANT INSERT ON identity.verification_submissions,identity.verification_decisions,identity.verification_receipts,identity.audit_events,identity.outbox_events TO trissea_m2_verification;
GRANT INSERT ON identity.audit_events,identity.outbox_events TO trissea_m2_verification_writer;
GRANT SELECT ON identity.account_consents TO trissea_m2_verification;
GRANT UPDATE(version) ON identity.app_users TO trissea_m2_verification;
CREATE POLICY verification_actor_lock ON identity.app_users FOR UPDATE TO trissea_m2_verification USING(id::text=current_setting('trissea.user_id',true) AND current_setting('trissea.client_purpose',true)='DRIVER') WITH CHECK(false);
GRANT SELECT(session_id,csrf_digest) ON identity.admin_browser_sessions TO trissea_m2_verification;
CREATE POLICY verification_own_consent ON identity.account_consents FOR SELECT TO trissea_m2_verification USING(user_id::text=current_setting('trissea.user_id',true) AND purpose='DRIVER');

-- The non-login function owner has only metadata and the projection columns;
-- no identity ciphertext, contact, password, session-cookie or refresh access.
GRANT SELECT(id,state,version,auth_version),UPDATE(version) ON identity.app_users TO trissea_m2_verification_writer;
GRANT SELECT(id,user_id,identity_id,identity_kind,client_purpose,state,auth_version,authenticated_at,mfa_verified_at,last_seen_at,expires_at) ON identity.app_sessions TO trissea_m2_verification_writer;
GRANT SELECT(id,user_id,kind,state) ON identity.auth_identities TO trissea_m2_verification_writer;
GRANT SELECT(identity_id,user_id,state) ON identity.administrative_identity_mappings TO trissea_m2_verification_writer;
GRANT SELECT ON identity.user_personas,identity.city_memberships,identity.scoped_role_assignments,identity.role_permissions TO trissea_m2_verification_writer;
GRANT SELECT(id,state),UPDATE(state) ON identity.city_tenants TO trissea_m2_verification_writer;
GRANT SELECT(id,city_tenant_id,state),UPDATE(state) ON identity.toda_organizations TO trissea_m2_verification_writer;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['app_users','app_sessions','user_personas','city_memberships','scoped_role_assignments','city_tenants','toda_organizations'] LOOP
  EXECUTE format('CREATE POLICY verification_metadata ON identity.%I TO trissea_m2_verification_writer USING(true) WITH CHECK(false)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['driver_profiles','driver_toda_affiliations','driver_synthetic_vehicles','driver_vehicle_relationships'] LOOP
  EXECUTE format('GRANT SELECT,UPDATE(state,version,verification_reference,valid_until) ON identity.%I TO trissea_m2_verification_writer',t);
  EXECUTE format('CREATE POLICY verification_projection ON identity.%I TO trissea_m2_verification_writer USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
GRANT UPDATE(seat_capacity) ON identity.driver_synthetic_vehicles TO trissea_m2_verification_writer;
GRANT SELECT,UPDATE(version) ON identity.driver_intake_scopes TO trissea_m2_verification_writer;
CREATE POLICY verification_intake_lock ON identity.driver_intake_scopes TO trissea_m2_verification_writer USING(true) WITH CHECK(false);

CREATE FUNCTION identity.verification_visible(p_case uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT FROM identity.verification_cases c WHERE c.id=p_case AND
 ((current_setting('trissea.client_purpose',true)='DRIVER' AND c.user_id::text=current_setting('trissea.user_id',true)) OR
 (current_setting('trissea.client_purpose',true)='ADMIN' AND c.city_tenant_id::text=current_setting('trissea.city_tenant_id',true) AND c.toda_id::text=current_setting('trissea.toda_id',true)
 AND EXISTS(SELECT FROM identity.verification_assignments a WHERE a.case_id=c.id AND a.assignment_version=c.assignment_version AND a.reviewer_user_id::text=current_setting('trissea.user_id',true)))))
$$;
CREATE FUNCTION identity.verification_locate(p_case uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.verification_cases;reviewer uuid;
BEGIN
 SELECT * INTO c FROM identity.verification_cases WHERE id=p_case;IF NOT FOUND THEN RETURN NULL;END IF;
 -- Parent-before-case matches driver own-account mutations and account restriction.
 PERFORM id FROM identity.app_users WHERE id=c.user_id FOR SHARE;
 SELECT * INTO c FROM identity.verification_cases WHERE id=p_case FOR UPDATE;
 SELECT reviewer_user_id INTO reviewer FROM identity.verification_assignments WHERE case_id=c.id AND assignment_version=c.assignment_version;
 IF ((current_setting('trissea.client_purpose',true)='DRIVER' AND c.user_id::text=current_setting('trissea.user_id',true)) OR (current_setting('trissea.client_purpose',true)='ADMIN' AND reviewer::text=current_setting('trissea.user_id',true))) IS NOT TRUE THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('id',c.id,'version',c.version,'ownerUserId',c.user_id,'makerUserId',c.user_id,'assignedUserId',reviewer,'cityTenantId',c.city_tenant_id,'todaId',c.toda_id,'kind','VERIFICATION_CASE');
END $$;
CREATE FUNCTION identity.verification_target(p_relationship uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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

CREATE POLICY verification_cases_read ON identity.verification_cases FOR SELECT TO trissea_m2_verification USING((current_setting('trissea.client_purpose',true)='DRIVER' AND user_id::text=current_setting('trissea.user_id',true)) OR identity.verification_visible(id));
CREATE POLICY verification_cases_open ON identity.verification_cases FOR INSERT TO trissea_m2_verification WITH CHECK(user_id::text=current_setting('trissea.user_id',true) AND current_setting('trissea.client_purpose',true)='DRIVER');
CREATE POLICY verification_cases_submit ON identity.verification_cases FOR UPDATE TO trissea_m2_verification USING(user_id::text=current_setting('trissea.user_id',true) AND current_setting('trissea.client_purpose',true)='DRIVER') WITH CHECK(user_id::text=current_setting('trissea.user_id',true) AND state='SUBMITTED');
CREATE POLICY verification_heads_read ON identity.verification_evidence_heads FOR SELECT TO trissea_m2_verification USING((current_setting('trissea.client_purpose',true)='DRIVER' AND user_id::text=current_setting('trissea.user_id',true)) OR EXISTS(SELECT FROM identity.verification_cases c WHERE c.id=nullif(current_setting('trissea.verification_case_id',true),'')::uuid AND c.relationship_id=verification_evidence_heads.relationship_id AND c.kind=verification_evidence_heads.kind AND c.user_id=verification_evidence_heads.user_id AND c.city_tenant_id=verification_evidence_heads.city_tenant_id AND c.toda_id=verification_evidence_heads.toda_id AND identity.verification_visible(c.id)));
CREATE POLICY verification_versions_read ON identity.verification_evidence_versions FOR SELECT TO trissea_m2_verification USING(EXISTS(SELECT FROM identity.verification_evidence_heads h WHERE h.id=evidence_id));
CREATE POLICY verification_submissions_read ON identity.verification_submissions FOR SELECT TO trissea_m2_verification USING(identity.verification_visible(case_id));
CREATE POLICY verification_submissions_insert ON identity.verification_submissions FOR INSERT TO trissea_m2_verification WITH CHECK(user_id::text=current_setting('trissea.user_id',true) AND current_setting('trissea.client_purpose',true)='DRIVER' AND identity.verification_visible(case_id));
CREATE POLICY verification_assignments_read ON identity.verification_assignments FOR SELECT TO trissea_m2_verification USING(identity.verification_visible(case_id));
CREATE POLICY verification_decisions_read ON identity.verification_decisions FOR SELECT TO trissea_m2_verification USING(identity.verification_visible(case_id));
CREATE POLICY verification_decisions_insert ON identity.verification_decisions FOR INSERT TO trissea_m2_verification WITH CHECK(actor_user_id::text=current_setting('trissea.user_id',true) AND current_setting('trissea.client_purpose',true)='ADMIN' AND identity.verification_visible(case_id));
CREATE POLICY verification_receipts_owner ON identity.verification_receipts TO trissea_m2_verification USING(actor_user_id::text=current_setting('trissea.user_id',true)) WITH CHECK(actor_user_id::text=current_setting('trissea.user_id',true));

CREATE FUNCTION identity.protect_verification_case() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE d identity.verification_decisions;
BEGIN
 IF TG_OP='INSERT' THEN IF NEW.state<>'DRAFT' OR NEW.version<>1 OR NEW.current_round<>0 OR NEW.assignment_version IS NOT NULL OR NEW.last_decision_id IS NOT NULL OR NEW.valid_until IS NOT NULL THEN RAISE EXCEPTION 'Invalid initial case' USING ERRCODE='23514';END IF;RETURN NEW;END IF;
 IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','current_round','assignment_version','last_decision_id','valid_until']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','current_round','assignment_version','last_decision_id','valid_until']) THEN RAISE EXCEPTION 'Immutable case binding or stale version' USING ERRCODE='23514';END IF;
 IF NEW.assignment_version IS DISTINCT FROM OLD.assignment_version THEN
  IF (to_jsonb(NEW)-ARRAY['version','assignment_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','assignment_version']) OR coalesce(NEW.assignment_version,0)<>coalesce(OLD.assignment_version,0)+1 THEN RAISE EXCEPTION 'Invalid assignment transition' USING ERRCODE='23514';END IF;RETURN NEW;
 END IF;
 IF NEW.state='SUBMITTED' AND OLD.state IN ('DRAFT','REJECTED','REVOKED','EXPIRED') AND NEW.current_round=OLD.current_round+1 AND NEW.last_decision_id IS NULL AND NEW.valid_until IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO d FROM identity.verification_decisions WHERE id=NEW.last_decision_id AND case_id=OLD.id AND round=OLD.current_round AND expected_version=OLD.version;
 IF NOT FOUND OR NEW.current_round<>OLD.current_round OR NEW.state<>(CASE d.outcome WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' WHEN 'REVOKE' THEN 'REVOKED' ELSE 'EXPIRED' END) OR NEW.valid_until IS DISTINCT FROM d.valid_until THEN RAISE EXCEPTION 'Case transition requires immutable decision' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER verification_case_transition BEFORE INSERT OR UPDATE ON identity.verification_cases FOR EACH ROW EXECUTE FUNCTION identity.protect_verification_case();
CREATE FUNCTION identity.check_verification_pointers() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.verification_cases;
BEGIN
 SELECT * INTO c FROM identity.verification_cases WHERE id=NEW.id;
 IF c.current_round>0 AND NOT EXISTS(SELECT FROM identity.verification_submissions WHERE case_id=c.id AND round=c.current_round) OR c.assignment_version IS NOT NULL AND NOT EXISTS(SELECT FROM identity.verification_assignments WHERE case_id=c.id AND assignment_version=c.assignment_version) OR c.last_decision_id IS NOT NULL AND NOT EXISTS(SELECT FROM identity.verification_decisions WHERE id=c.last_decision_id AND case_id=c.id AND round=c.current_round) THEN RAISE EXCEPTION 'Invalid case history pointer' USING ERRCODE='23503';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER verification_history_pointers AFTER INSERT OR UPDATE ON identity.verification_cases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity.check_verification_pointers();
CREATE FUNCTION identity.check_verification_head() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM identity.verification_evidence_versions v JOIN identity.verification_evidence_heads h ON h.id=v.evidence_id AND h.current_version=v.evidence_version WHERE h.id=NEW.id) THEN RAISE EXCEPTION 'Missing current synthetic evidence version' USING ERRCODE='23503';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER verification_head_pointer AFTER INSERT OR UPDATE ON identity.verification_evidence_heads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity.check_verification_head();
CREATE FUNCTION identity.protect_verification_head() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.current_version<>OLD.current_version+1 OR (to_jsonb(NEW)-'current_version') IS DISTINCT FROM (to_jsonb(OLD)-'current_version') THEN RAISE EXCEPTION 'Immutable evidence binding/version' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER verification_head_immutable BEFORE UPDATE ON identity.verification_evidence_heads FOR EACH ROW EXECUTE FUNCTION identity.protect_verification_head();
CREATE FUNCTION identity.check_verification_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.verification_cases;h identity.verification_evidence_heads;previous identity.verification_submissions;facts jsonb;
BEGIN
 SELECT * INTO c FROM identity.verification_cases WHERE id=NEW.case_id FOR UPDATE;
 IF current_setting('trissea.client_purpose',true) IS DISTINCT FROM 'DRIVER' OR c.user_id::text IS DISTINCT FROM current_setting('trissea.user_id',true) OR c.state<>'SUBMITTED' OR c.current_round<>NEW.round THEN RAISE EXCEPTION 'Submission unavailable' USING ERRCODE='42501';END IF;
 facts:=identity.verification_target(c.relationship_id);
 SELECT * INTO h FROM identity.verification_evidence_heads WHERE id=NEW.evidence_id FOR SHARE;
 IF h.current_version<>NEW.evidence_version OR NEW.profile_version<>(facts->>'profileVersion')::integer OR NEW.affiliation_version<>(facts->>'affiliationVersion')::integer OR NEW.vehicle_version<>(facts->>'vehicleVersion')::integer OR NEW.relationship_version<>(facts->>'relationshipVersion')::integer OR NEW.intake_version<>(facts->>'intakeVersion')::integer OR NEW.policy_reference<>(facts->>'policyReference')::uuid THEN RAISE EXCEPTION 'Stale evidence or target' USING ERRCODE='23514';END IF;
 SELECT * INTO previous FROM identity.verification_submissions WHERE case_id=c.id AND round=NEW.round-1;
 IF FOUND AND previous.evidence_id=NEW.evidence_id AND NEW.evidence_version<=previous.evidence_version THEN RAISE EXCEPTION 'Resubmission requires revised evidence' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER verification_submission_validate BEFORE INSERT ON identity.verification_submissions FOR EACH ROW EXECUTE FUNCTION identity.check_verification_submission();

CREATE FUNCTION identity.check_verification_decision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.verification_cases;s identity.verification_submissions;h identity.verification_evidence_heads;e identity.verification_evidence_versions;previous identity.verification_decisions;facts jsonb;required_role text;required_permission text;
BEGIN
 SELECT * INTO c FROM identity.verification_cases WHERE id=NEW.case_id FOR UPDATE;
 IF current_setting('trissea.client_purpose',true) IS DISTINCT FROM 'ADMIN' OR NEW.actor_user_id::text IS DISTINCT FROM current_setting('trissea.user_id',true) OR NEW.actor_session_id::text IS DISTINCT FROM current_setting('trissea.session_id',true) OR NEW.actor_user_id=c.user_id OR c.version<>NEW.expected_version OR c.current_round<>NEW.round OR NOT identity.verification_visible(c.id) THEN RAISE EXCEPTION 'Decision context unavailable' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT FROM identity.verification_assignments WHERE case_id=c.id AND assignment_version=c.assignment_version AND reviewer_user_id=NEW.actor_user_id) THEN RAISE EXCEPTION 'Unassigned review' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT FROM identity.app_sessions x JOIN identity.app_users u ON u.id=x.user_id JOIN identity.auth_identities i ON i.id=x.identity_id AND i.user_id=u.id JOIN identity.administrative_identity_mappings m ON m.identity_id=i.id AND m.user_id=u.id WHERE x.id=NEW.actor_session_id AND x.user_id=NEW.actor_user_id AND x.client_purpose='ADMIN' AND x.identity_kind='KEYCLOAK' AND x.state='ACTIVE' AND u.state='ACTIVE' AND x.auth_version=u.auth_version AND i.state='ACTIVE' AND m.state='APPROVED' AND x.expires_at>clock_timestamp() AND x.last_seen_at>clock_timestamp()-interval '900 seconds' AND x.authenticated_at>clock_timestamp()-interval '300 seconds' AND x.mfa_verified_at>clock_timestamp()-interval '300 seconds') THEN RAISE EXCEPTION 'Fresh administrator session required' USING ERRCODE='42501';END IF;
 required_role:=CASE WHEN c.kind='TODA_MEMBERSHIP' THEN 'TODA_MANAGER' ELSE 'VERIFICATION_OFFICER' END;required_permission:=CASE WHEN c.kind='TODA_MEMBERSHIP' THEN 'toda.members.manage' ELSE 'driver.verify' END;
 IF NOT EXISTS(SELECT FROM identity.scoped_role_assignments g JOIN identity.city_memberships m ON m.user_id=g.user_id AND m.city_tenant_id=g.city_tenant_id JOIN identity.role_permissions p ON p.role_code=g.role_code WHERE g.user_id=NEW.actor_user_id AND g.city_tenant_id=c.city_tenant_id AND g.role_code=required_role AND p.permission_code=required_permission AND g.starts_at<=clock_timestamp() AND g.expires_at>clock_timestamp() AND g.revoked_at IS NULL AND m.state='ACTIVE' AND ((g.scope_kind='TODA' AND g.toda_id=c.toda_id) OR (c.kind<>'TODA_MEMBERSHIP' AND g.scope_kind='CITY' AND g.toda_id IS NULL))) THEN RAISE EXCEPTION 'Current scoped grant required' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM identity.verification_submissions WHERE case_id=c.id AND round=c.current_round;
 IF NOT FOUND OR NEW.evidence_version<>s.evidence_version THEN RAISE EXCEPTION 'Stale evidence revision' USING ERRCODE='23514';END IF;
 IF (NEW.outcome='APPROVE' AND NEW.reason_code<>'SYNTHETIC_ACCEPTED') OR (NEW.outcome='REJECT' AND NEW.reason_code NOT IN ('SYNTHETIC_INCOMPLETE','SYNTHETIC_MISMATCH')) OR (NEW.outcome='REVOKE' AND NEW.reason_code<>'SYNTHETIC_WITHDRAWN') OR (NEW.outcome='EXPIRE' AND NEW.reason_code<>'SYNTHETIC_EXPIRED') THEN RAISE EXCEPTION 'Invalid decision reason' USING ERRCODE='23514';END IF;
 facts:=identity.verification_target(c.relationship_id);
 IF NEW.outcome IN ('APPROVE','REJECT') THEN
  IF c.state<>'SUBMITTED' THEN RAISE EXCEPTION 'Case is not submitted' USING ERRCODE='23514';END IF;
  SELECT * INTO h FROM identity.verification_evidence_heads WHERE id=s.evidence_id FOR SHARE;
  SELECT * INTO e FROM identity.verification_evidence_versions WHERE evidence_id=s.evidence_id AND evidence_version=s.evidence_version;
  IF NEW.outcome='APPROVE' AND (h.current_version<>s.evidence_version OR s.profile_version<>(facts->>'profileVersion')::integer OR s.affiliation_version<>(facts->>'affiliationVersion')::integer OR s.vehicle_version<>(facts->>'vehicleVersion')::integer OR s.relationship_version<>(facts->>'relationshipVersion')::integer OR s.intake_version<>(facts->>'intakeVersion')::integer OR s.policy_reference<>(facts->>'policyReference')::uuid) THEN RAISE EXCEPTION 'Stale target/policy/evidence' USING ERRCODE='23514';END IF;
  IF NEW.outcome='APPROVE' AND (e.valid_until<=clock_timestamp() OR (c.kind='VEHICLE' AND e.seat_capacity IS NULL) OR (c.kind<>'VEHICLE' AND e.seat_capacity IS NOT NULL)) THEN RAISE EXCEPTION 'Incomplete or expired synthetic evidence' USING ERRCODE='23514';END IF;
  NEW.valid_until:=CASE WHEN NEW.outcome='APPROVE' THEN e.valid_until ELSE NULL END;NEW.previous_decision_id:=NULL;
 ELSE
  SELECT * INTO previous FROM identity.verification_decisions WHERE id=c.last_decision_id AND case_id=c.id AND round=c.current_round AND outcome='APPROVE';
  IF c.state<>'APPROVED' OR NOT FOUND OR (NEW.outcome='EXPIRE' AND c.valid_until>clock_timestamp()) THEN RAISE EXCEPTION 'Invalid terminal decision' USING ERRCODE='23514';END IF;
  NEW.previous_decision_id:=previous.id;NEW.valid_until:=previous.valid_until;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER verification_decision_validate BEFORE INSERT ON identity.verification_decisions FOR EACH ROW EXECUTE FUNCTION identity.check_verification_decision();
CREATE FUNCTION identity.project_verification_decision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c identity.verification_cases;r identity.driver_vehicle_relationships;e identity.verification_evidence_versions;new_state text;event_id uuid;action_code text;
BEGIN
 SELECT * INTO c FROM identity.verification_cases WHERE id=NEW.case_id;
 SELECT * INTO r FROM identity.driver_vehicle_relationships WHERE id=c.relationship_id;
 new_state:=CASE NEW.outcome WHEN 'APPROVE' THEN 'VERIFIED' WHEN 'REVOKE' THEN 'REVOKED' ELSE 'EXPIRED' END;
 IF NEW.outcome IN ('APPROVE','REVOKE','EXPIRE') THEN
  IF c.kind='DRIVER' THEN UPDATE identity.driver_profiles SET state=new_state,version=version+1,verification_reference=NEW.id,valid_until=NEW.valid_until WHERE user_id=c.user_id AND (NEW.outcome='APPROVE' OR verification_reference=NEW.previous_decision_id);
  ELSIF c.kind='TODA_MEMBERSHIP' THEN UPDATE identity.driver_toda_affiliations SET state=new_state,version=version+1,verification_reference=NEW.id,valid_until=NEW.valid_until WHERE id=r.affiliation_id AND (NEW.outcome='APPROVE' OR verification_reference=NEW.previous_decision_id);
  ELSE
   SELECT v.* INTO e FROM identity.verification_evidence_versions v JOIN identity.verification_submissions s ON s.evidence_id=v.evidence_id AND s.evidence_version=v.evidence_version WHERE s.case_id=c.id AND s.round=NEW.round;
   UPDATE identity.driver_synthetic_vehicles SET state=new_state,version=version+1,verification_reference=NEW.id,valid_until=NEW.valid_until,seat_capacity=CASE WHEN NEW.outcome='APPROVE' THEN e.seat_capacity ELSE seat_capacity END WHERE id=r.vehicle_id AND (NEW.outcome='APPROVE' OR verification_reference=NEW.previous_decision_id);
   UPDATE identity.driver_vehicle_relationships SET state=new_state,version=version+1,verification_reference=NEW.id,valid_until=NEW.valid_until WHERE id=r.id AND (NEW.outcome='APPROVE' OR verification_reference=NEW.previous_decision_id);
  END IF;
 END IF;
 UPDATE identity.verification_cases SET state=CASE NEW.outcome WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' WHEN 'REVOKE' THEN 'REVOKED' ELSE 'EXPIRED' END,version=version+1,last_decision_id=NEW.id,valid_until=NEW.valid_until WHERE id=c.id;
 event_id:=gen_random_uuid();action_code:=CASE NEW.outcome WHEN 'APPROVE' THEN 'verification.approved' WHEN 'REJECT' THEN 'verification.rejected' WHEN 'REVOKE' THEN 'verification.revoked' ELSE 'verification.expired' END;
 INSERT INTO identity.audit_events(id,actor_user_id,actor_session_id,city_tenant_id,toda_id,action,resource_id,outcome,reason_code,trace_id) VALUES(event_id,NEW.actor_user_id,NEW.actor_session_id,c.city_tenant_id,c.toda_id,action_code,c.id,'COMPLETED',NEW.reason_code,gen_random_uuid());
 INSERT INTO identity.outbox_events(audit_event_id,aggregate_id,event_type) VALUES(event_id,c.id,action_code);
 RETURN NULL;
END $$;
CREATE TRIGGER verification_decision_project AFTER INSERT ON identity.verification_decisions FOR EACH ROW EXECUTE FUNCTION identity.project_verification_decision();
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['verification_evidence_versions','verification_submissions','verification_assignments','verification_decisions','verification_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER verification_immutable BEFORE UPDATE OR DELETE ON identity.%I FOR EACH ROW EXECUTE FUNCTION identity.reject_mutation()',t);
 END LOOP;
END $$;
-- Transfer hardened functions only; the API must never inherit this role or own tables.
-- Read-side invalidation: replacing an evidence head cannot leave an older
-- projected fact eligible. This grants a boolean only, never review metadata.
CREATE FUNCTION identity.verification_evidence_current(p_case uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT identity.verification_visible(p_case) AND EXISTS(SELECT FROM identity.verification_cases c JOIN identity.verification_submissions s ON s.case_id=c.id AND s.round=c.current_round JOIN identity.verification_evidence_heads h ON h.id=s.evidence_id WHERE c.id=p_case AND h.current_version=s.evidence_version)
$$;
CREATE FUNCTION identity.driver_verification_current(p_user uuid,p_city uuid,p_toda uuid,p_relationship uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT current_setting('trissea.client_purpose',true)='DRIVER' AND p_user::text=current_setting('trissea.user_id',true) AND p_city::text=current_setting('trissea.city_tenant_id',true) AND p_toda::text=current_setting('trissea.toda_id',true) AND
 (SELECT count(DISTINCT c.kind)=3 FROM identity.verification_cases c
 JOIN identity.verification_submissions s ON s.case_id=c.id AND s.round=c.current_round
 JOIN identity.verification_evidence_heads h ON h.id=s.evidence_id AND h.current_version=s.evidence_version
 JOIN identity.verification_decisions d ON d.id=c.last_decision_id AND d.case_id=c.id AND d.round=c.current_round AND d.outcome='APPROVE'
 JOIN identity.driver_vehicle_relationships r ON r.id=c.relationship_id
 JOIN identity.driver_profiles p ON p.user_id=c.user_id
 JOIN identity.driver_toda_affiliations a ON a.id=r.affiliation_id
 JOIN identity.driver_synthetic_vehicles v ON v.id=r.vehicle_id
 WHERE c.user_id=p_user AND c.city_tenant_id=p_city AND c.toda_id=p_toda AND c.relationship_id=p_relationship AND c.state='APPROVED' AND c.valid_until>clock_timestamp()
 AND ((c.kind='DRIVER' AND p.verification_reference=d.id) OR (c.kind='TODA_MEMBERSHIP' AND a.verification_reference=d.id) OR (c.kind='VEHICLE' AND r.verification_reference=d.id AND v.verification_reference=d.id)))
$$;
GRANT CREATE ON SCHEMA identity TO trissea_m2_verification_writer;
DO $$ DECLARE f text;BEGIN
 FOREACH f IN ARRAY ARRAY['verification_visible(uuid)','verification_locate(uuid)','verification_target(uuid)','verification_evidence_current(uuid)','driver_verification_current(uuid,uuid,uuid,uuid)','check_verification_pointers()','check_verification_head()','check_verification_submission()','check_verification_decision()','project_verification_decision()'] LOOP
  EXECUTE 'ALTER FUNCTION identity.'||f||' OWNER TO trissea_m2_verification_writer';EXECUTE 'REVOKE ALL ON FUNCTION identity.'||f||' FROM PUBLIC';
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA identity FROM trissea_m2_verification_writer;
GRANT EXECUTE ON FUNCTION identity.verification_visible(uuid),identity.verification_locate(uuid),identity.verification_target(uuid) TO trissea_m2_verification;
GRANT EXECUTE ON FUNCTION identity.verification_evidence_current(uuid) TO trissea_m2_verification;
GRANT EXECUTE ON FUNCTION identity.driver_verification_current(uuid,uuid,uuid,uuid) TO trissea_m2_auth;
