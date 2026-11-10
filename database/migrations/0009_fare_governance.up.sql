-- M3 administrative simulations only. No activation role edge or operational tariff.
CREATE SCHEMA fare;
REVOKE ALL ON SCHEMA fare FROM PUBLIC;
GRANT USAGE ON SCHEMA fare TO trissea_m2_admin_auth;

CREATE FUNCTION fare.allowed(p_city uuid,p_permission text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT current_setting('trissea.client_purpose',true)='ADMIN'
 AND p_city::text=current_setting('trissea.city_tenant_id',true)
 AND EXISTS(SELECT FROM identity.app_sessions s
 JOIN identity.app_users u ON u.id=s.user_id
 JOIN identity.auth_identities i ON i.id=s.identity_id AND i.user_id=u.id
 JOIN identity.administrative_identity_mappings a ON a.identity_id=i.id AND a.user_id=u.id
 JOIN identity.city_memberships m ON m.user_id=u.id AND m.city_tenant_id=p_city
 JOIN identity.city_tenants c ON c.id=p_city
 JOIN identity.scoped_role_assignments g ON g.user_id=u.id AND g.city_tenant_id=p_city
 JOIN identity.role_permissions r ON r.role_code=g.role_code AND r.permission_code=p_permission
 WHERE s.id::text=current_setting('trissea.session_id',true) AND u.id::text=current_setting('trissea.user_id',true)
 AND s.client_purpose='ADMIN' AND s.identity_kind='KEYCLOAK' AND i.kind='KEYCLOAK'
 AND u.state='ACTIVE' AND i.state='ACTIVE' AND a.state='APPROVED' AND s.state='ACTIVE'
 AND s.auth_version=u.auth_version AND s.expires_at>clock_timestamp()
 AND s.authenticated_at<=clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '15 minutes'
 AND s.mfa_verified_at>=s.authenticated_at AND s.mfa_verified_at<=clock_timestamp()
 AND m.state='ACTIVE' AND c.state='ACTIVE' AND g.scope_kind='CITY' AND g.toda_id IS NULL
 AND g.revoked_at IS NULL AND g.starts_at<=clock_timestamp() AND g.expires_at>clock_timestamp()
 AND ((p_permission='fare.draft' AND g.role_code='CITY_FARE_EDITOR') OR
 (p_permission='fare.approve' AND g.role_code='CITY_FARE_APPROVER'
 AND s.authenticated_at>clock_timestamp()-interval '5 minutes' AND s.mfa_verified_at>clock_timestamp()-interval '5 minutes')))
$$;
CREATE FUNCTION fare.visible(p_city uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT fare.allowed(p_city,'fare.draft') OR fare.allowed(p_city,'fare.approve')
$$;
CREATE FUNCTION fare.integer_value(v jsonb,minimum numeric,maximum numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_typeof(v)='number' AND v::text ~ '^\d+$' AND (v::text)::numeric BETWEEN minimum AND maximum,false)
$$;
CREATE FUNCTION fare.valid_config(kind text,c jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE b jsonb;previous integer:=0;count_bands integer;position integer:=0;
BEGIN
 IF jsonb_typeof(c)<>'object' THEN RETURN false;END IF;
 IF kind='LGU_MATRIX' THEN RETURN (SELECT count(*)=1 FROM jsonb_object_keys(c)) AND c->>'importId' ~ '^[0-9a-f-]{36}$';END IF;
 IF kind='DISTANCE_PROPOSAL' THEN
  IF NOT (c ?& ARRAY['baseCentavos','includedMetres','rateCentavosPerKm','incrementMetres','rounding','reviewThresholdCentavos','maximumCentavos','discounted']) OR (SELECT count(*) FROM jsonb_object_keys(c))<>8 THEN RETURN false;END IF;
  IF NOT coalesce((fare.integer_value(c->'baseCentavos',0,100000000) AND fare.integer_value(c->'includedMetres',0,100000000) AND fare.integer_value(c->'rateCentavosPerKm',0,100000000) AND fare.integer_value(c->'incrementMetres',1,100000000) AND fare.integer_value(c->'reviewThresholdCentavos',1,100000000) AND (c->'maximumCentavos'='null'::jsonb OR fare.integer_value(c->'maximumCentavos',0,100000000)) AND c->>'rounding' IN ('CENTAVO_HALF_UP','CENTAVO_CEIL')),false) THEN RETURN false;END IF;
  b:=c->'discounted';
  RETURN b='null'::jsonb OR (jsonb_typeof(b)='object' AND b ?& ARRAY['baseCentavos','rateCentavosPerKm','assumption'] AND (SELECT count(*) FROM jsonb_object_keys(b))=3 AND fare.integer_value(b->'baseCentavos',0,100000000) AND fare.integer_value(b->'rateCentavosPerKm',0,100000000) AND jsonb_typeof(b->'assumption')='string' AND length(b->>'assumption') BETWEEN 1 AND 200);
 END IF;
 IF kind<>'PRIVATE_HIRE_PROPOSAL' OR NOT (c ?& ARRAY['simulationCapacity','capacityPolicyReference','bands','rounding','discountedCompensationBps','discountAssumption']) OR (SELECT count(*) FROM jsonb_object_keys(c))<>6 THEN RETURN false;END IF;
 IF NOT coalesce((fare.integer_value(c->'simulationCapacity',1,5) AND jsonb_typeof(c->'capacityPolicyReference')='string' AND length(c->>'capacityPolicyReference') BETWEEN 1 AND 200 AND c->>'rounding' IN ('CENTAVO_HALF_UP','CENTAVO_CEIL') AND jsonb_typeof(c->'bands')='array'),false) THEN RETURN false;END IF;
 count_bands:=jsonb_array_length(c->'bands');IF count_bands NOT BETWEEN 1 AND 20 THEN RETURN false;END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(c->'bands') LOOP
  position:=position+1;
  IF jsonb_typeof(b)<>'object' OR NOT (b ?& ARRAY['upToMetres','compensationBps']) OR (SELECT count(*) FROM jsonb_object_keys(b))<>2 OR NOT fare.integer_value(b->'compensationBps',0,10000) THEN RETURN false;END IF;
  IF position=count_bands THEN IF b->'upToMetres'<>'null'::jsonb THEN RETURN false;END IF;
  ELSE IF NOT fare.integer_value(b->'upToMetres',previous+1,100000000) THEN RETURN false;END IF;previous:=(b->>'upToMetres')::integer;END IF;
 END LOOP;
 RETURN (c->'discountedCompensationBps'='null'::jsonb AND c->'discountAssumption'='null'::jsonb) OR (fare.integer_value(c->'discountedCompensationBps',0,10000) AND jsonb_typeof(c->'discountAssumption')='string' AND length(c->>'discountAssumption') BETWEEN 1 AND 200);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE TABLE fare.sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_tenant_id uuid NOT NULL REFERENCES identity.city_tenants(id),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 200),reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 300),
 provenance text NOT NULL CHECK(length(provenance) BETWEEN 1 AND 1000),
 maker_user_id uuid NOT NULL REFERENCES identity.app_users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(city_tenant_id,id));
CREATE TABLE fare.imports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_tenant_id uuid NOT NULL,source_id uuid NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),original_csv text NOT NULL CHECK(octet_length(original_csv)<=30000),
 origin_confirmation text NOT NULL CHECK(origin_confirmation='OWNER_CONFIRMED_PLAZA_ONE_WAY_PER_PASSENGER'),
 effective_from timestamptz,effective_until timestamptz,tariff_reference text CHECK(length(tariff_reference) BETWEEN 1 AND 300),
 maker_user_id uuid NOT NULL REFERENCES identity.app_users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(city_tenant_id,source_id) REFERENCES fare.sources(city_tenant_id,id),UNIQUE(city_tenant_id,id),
 CHECK(effective_until IS NULL OR effective_from IS NOT NULL AND effective_until>effective_from),
 CHECK(sha256=encode(sha256(convert_to(original_csv,'UTF8')),'hex')));
CREATE TABLE fare.matrix_rows(
 city_tenant_id uuid NOT NULL,import_id uuid NOT NULL,destination_label text NOT NULL CHECK(length(destination_label) BETWEEN 1 AND 160),
 category text NOT NULL CHECK(category IN ('LISTED_AREA','POBLACION')),regular_centavos integer NOT NULL CHECK(regular_centavos>=0),discounted_centavos integer NOT NULL CHECK(discounted_centavos BETWEEN 0 AND regular_centavos),
 regular_php text NOT NULL CHECK(regular_php ~ '^\d{1,6}\.\d{2}$' AND replace(regular_php,'.','')::integer=regular_centavos),discounted_php text NOT NULL CHECK(discounted_php ~ '^\d{1,6}\.\d{2}$' AND replace(discounted_php,'.','')::integer=discounted_centavos),
 source_page integer NOT NULL CHECK(source_page IN (1,2)),original_status text NOT NULL CHECK(original_status='UNVERIFIED_PENDING_CITY_APPROVAL'),original_origin_scope text NOT NULL,original_effective_from text NOT NULL CHECK(original_effective_from=''),
 PRIMARY KEY(import_id,destination_label),FOREIGN KEY(city_tenant_id,import_id) REFERENCES fare.imports(city_tenant_id,id),
 CHECK(category='LISTED_AREA' AND original_origin_scope='UNKNOWN' OR category='POBLACION' AND destination_label='Poblacion (within)' AND original_origin_scope='POBLACION_TO_POBLACION' AND regular_centavos=2200 AND discounted_centavos=1800));
CREATE UNIQUE INDEX fare_matrix_label_case ON fare.matrix_rows(import_id,lower(destination_label));
CREATE TABLE fare.policy_families(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_tenant_id uuid NOT NULL REFERENCES identity.city_tenants(id),
 kind text NOT NULL CHECK(kind IN ('LGU_MATRIX','DISTANCE_PROPOSAL','PRIVATE_HIRE_PROPOSAL')),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 maker_user_id uuid NOT NULL REFERENCES identity.app_users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(city_tenant_id,id),UNIQUE(id,kind));
CREATE TABLE fare.policy_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_tenant_id uuid NOT NULL,family_id uuid NOT NULL,kind text NOT NULL,
 revision integer NOT NULL CHECK(revision>0),previous_version_id uuid,config jsonb NOT NULL,
 state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
 lifecycle_version integer NOT NULL DEFAULT 1 CHECK(lifecycle_version>0),
 effective_from timestamptz,effective_until timestamptz,legal_reference text CHECK(length(legal_reference) BETWEEN 1 AND 300),
 geographic_scope text NOT NULL DEFAULT 'TUGUEGARAO_SIMULATION_ONLY' CHECK(geographic_scope='TUGUEGARAO_SIMULATION_ONLY'),
 activation_status text NOT NULL DEFAULT 'CLOSED' CHECK(activation_status='CLOSED'),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(city_tenant_id,family_id) REFERENCES fare.policy_families(city_tenant_id,id),FOREIGN KEY(family_id,kind) REFERENCES fare.policy_families(id,kind),
 FOREIGN KEY(city_tenant_id,previous_version_id) REFERENCES fare.policy_versions(city_tenant_id,id),
 UNIQUE(city_tenant_id,id),UNIQUE(family_id,revision),CHECK(fare.valid_config(kind,config) IS TRUE),
 CHECK(effective_until IS NULL OR effective_from IS NOT NULL AND effective_until>effective_from));
CREATE INDEX fare_versions_city ON fare.policy_versions(city_tenant_id,family_id,revision DESC);
CREATE TABLE fare.reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_tenant_id uuid NOT NULL,policy_version_id uuid NOT NULL UNIQUE,
 expected_lifecycle_version integer NOT NULL CHECK(expected_lifecycle_version>0),outcome text NOT NULL CHECK(outcome IN ('APPROVE','REJECT')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),actor_user_id uuid NOT NULL,actor_session_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(actor_session_id,actor_user_id) REFERENCES identity.app_sessions(id,user_id),FOREIGN KEY(city_tenant_id,policy_version_id) REFERENCES fare.policy_versions(city_tenant_id,id));
CREATE TABLE fare.calculations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_tenant_id uuid NOT NULL,reference_policy_version_id uuid NOT NULL,private_policy_version_id uuid,
 actor_user_id uuid NOT NULL,actor_session_id uuid NOT NULL,input jsonb NOT NULL,result jsonb NOT NULL,
 payable boolean NOT NULL DEFAULT false CHECK(payable=false),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(actor_session_id,actor_user_id) REFERENCES identity.app_sessions(id,user_id),
 FOREIGN KEY(city_tenant_id,reference_policy_version_id) REFERENCES fare.policy_versions(city_tenant_id,id),FOREIGN KEY(city_tenant_id,private_policy_version_id) REFERENCES fare.policy_versions(city_tenant_id,id),
 CHECK((result->'payable'='false'::jsonb AND result->'simulationOnly'='true'::jsonb AND result->>'method' IN ('LGU_MATRIX','DISTANCE_PROPOSAL','PRIVATE_HIRE_PROPOSAL','UNAVAILABLE')) IS TRUE));
CREATE INDEX fare_calculations_city ON fare.calculations(city_tenant_id,created_at DESC,id);
CREATE TABLE fare.receipts(
 city_tenant_id uuid NOT NULL REFERENCES identity.city_tenants(id),actor_user_id uuid NOT NULL REFERENCES identity.app_users(id),operation text NOT NULL,
 key_digest text NOT NULL CHECK(key_digest ~ '^[0-9a-f]{64}$'),request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_user_id,operation,key_digest));

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['sources','imports','matrix_rows','policy_families','policy_versions','reviews','calculations','receipts'] LOOP
  EXECUTE format('ALTER TABLE fare.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE fare.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON fare.%I FROM PUBLIC',t);
  EXECUTE format('GRANT SELECT,INSERT ON fare.%I TO trissea_m2_admin_auth',t);
  EXECUTE format('CREATE POLICY fare_read ON fare.%I FOR SELECT TO trissea_m2_admin_auth USING(fare.visible(city_tenant_id))',t);
  IF t IN ('sources','imports','matrix_rows','policy_families','policy_versions') THEN
   EXECUTE format('CREATE POLICY fare_write ON fare.%I FOR INSERT TO trissea_m2_admin_auth WITH CHECK(fare.allowed(city_tenant_id,''fare.draft''))',t);
  ELSE
   EXECUTE format('CREATE POLICY fare_write ON fare.%I FOR INSERT TO trissea_m2_admin_auth WITH CHECK(fare.visible(city_tenant_id))',t);
  END IF;
 END LOOP;
END $$;
GRANT UPDATE(state,lifecycle_version) ON fare.policy_versions TO trissea_m2_admin_auth;
CREATE POLICY fare_transition ON fare.policy_versions FOR UPDATE TO trissea_m2_admin_auth USING(fare.visible(city_tenant_id)) WITH CHECK(fare.visible(city_tenant_id));
CREATE FUNCTION fare.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Immutable fare history' USING ERRCODE='23514';END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['sources','imports','matrix_rows','policy_families','reviews','calculations','receipts'] LOOP
  EXECUTE format('CREATE TRIGGER fare_immutable BEFORE UPDATE OR DELETE ON fare.%I FOR EACH ROW EXECUTE FUNCTION fare.immutable()',t);
 END LOOP;
END $$;
CREATE FUNCTION fare.guard_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE f fare.policy_families;previous fare.policy_versions;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable fare history' USING ERRCODE='23514';END IF;
 SELECT * INTO STRICT f FROM fare.policy_families WHERE id=NEW.family_id;
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.family_id::text,903));
  SELECT * INTO previous FROM fare.policy_versions WHERE family_id=f.id ORDER BY revision DESC LIMIT 1;
  IF NOT fare.allowed(NEW.city_tenant_id,'fare.draft') OR f.maker_user_id::text IS DISTINCT FROM current_setting('trissea.user_id',true)
   OR NEW.revision<>coalesce(previous.revision,0)+1 OR NEW.previous_version_id IS DISTINCT FROM previous.id OR previous.state='SUBMITTED'
   OR NEW.state<>'DRAFT' OR NEW.lifecycle_version<>1 THEN RAISE EXCEPTION 'Fare revision conflict' USING ERRCODE='23514';END IF;
  IF NEW.kind='LGU_MATRIX' AND NOT EXISTS(SELECT FROM fare.imports WHERE id=(NEW.config->>'importId')::uuid AND city_tenant_id=NEW.city_tenant_id) THEN RAISE EXCEPTION 'Fare source unavailable' USING ERRCODE='23514';END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','lifecycle_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','lifecycle_version']) OR NEW.lifecycle_version<>OLD.lifecycle_version+1 THEN RAISE EXCEPTION 'Immutable fare version' USING ERRCODE='23514';END IF;
  IF OLD.state='DRAFT' AND NEW.state='SUBMITTED' THEN
   IF NOT fare.allowed(NEW.city_tenant_id,'fare.draft') OR f.maker_user_id::text IS DISTINCT FROM current_setting('trissea.user_id',true) OR EXISTS(SELECT FROM fare.policy_versions WHERE family_id=f.id AND revision>NEW.revision) THEN RAISE EXCEPTION 'Fare submit denied' USING ERRCODE='23514';END IF;
  ELSIF OLD.state='SUBMITTED' AND NEW.state IN ('APPROVED','REJECTED') THEN
   IF NOT fare.allowed(NEW.city_tenant_id,'fare.approve') OR f.maker_user_id::text=current_setting('trissea.user_id',true) OR NOT EXISTS(SELECT FROM fare.reviews WHERE policy_version_id=NEW.id AND actor_user_id::text=current_setting('trissea.user_id',true) AND outcome=CASE NEW.state WHEN 'APPROVED' THEN 'APPROVE' ELSE 'REJECT' END) THEN RAISE EXCEPTION 'Independent review required' USING ERRCODE='23514';END IF;
  ELSE RAISE EXCEPTION 'Fare transition denied' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER fare_version_guard BEFORE INSERT OR UPDATE OR DELETE ON fare.policy_versions FOR EACH ROW EXECUTE FUNCTION fare.guard_version();
CREATE FUNCTION fare.guard_review() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE v fare.policy_versions;maker uuid;
BEGIN
 SELECT * INTO STRICT v FROM fare.policy_versions WHERE id=NEW.policy_version_id FOR UPDATE;
 SELECT maker_user_id INTO maker FROM fare.policy_families WHERE id=v.family_id;
 IF NOT fare.allowed(NEW.city_tenant_id,'fare.approve') OR v.state<>'SUBMITTED' OR v.lifecycle_version<>NEW.expected_lifecycle_version
  OR maker=NEW.actor_user_id OR NEW.actor_user_id::text IS DISTINCT FROM current_setting('trissea.user_id',true) OR NEW.actor_session_id::text IS DISTINCT FROM current_setting('trissea.session_id',true)
 THEN RAISE EXCEPTION 'Fare review denied' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER fare_review_guard BEFORE INSERT ON fare.reviews FOR EACH ROW EXECUTE FUNCTION fare.guard_review();
CREATE FUNCTION fare.project_review() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$ BEGIN
 UPDATE fare.policy_versions SET state=CASE NEW.outcome WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,lifecycle_version=lifecycle_version+1 WHERE id=NEW.policy_version_id;RETURN NEW;END $$;
CREATE TRIGGER fare_review_projection AFTER INSERT ON fare.reviews FOR EACH ROW EXECUTE FUNCTION fare.project_review();
CREATE FUNCTION fare.guard_actor() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$ BEGIN
 IF TG_TABLE_NAME IN ('sources','imports','policy_families') THEN
  IF NEW.maker_user_id::text IS DISTINCT FROM current_setting('trissea.user_id',true) THEN RAISE EXCEPTION 'Fare maker mismatch' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.actor_user_id::text IS DISTINCT FROM current_setting('trissea.user_id',true) THEN RAISE EXCEPTION 'Fare actor mismatch' USING ERRCODE='23514';END IF;
  IF TG_TABLE_NAME='calculations' AND to_jsonb(NEW)->>'actor_session_id' IS DISTINCT FROM current_setting('trissea.session_id',true) THEN RAISE EXCEPTION 'Fare session mismatch' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['sources','imports','policy_families','calculations','receipts'] LOOP
 EXECUTE format('CREATE TRIGGER fare_actor_guard BEFORE INSERT ON fare.%I FOR EACH ROW EXECUTE FUNCTION fare.guard_actor()',t);
END LOOP;END $$;
CREATE FUNCTION fare.complete_import() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$ BEGIN
 IF (SELECT count(*) FROM fare.matrix_rows WHERE import_id=NEW.id)<>43 OR (SELECT count(*) FROM fare.matrix_rows WHERE import_id=NEW.id AND category='LISTED_AREA')<>42 THEN RAISE EXCEPTION 'Incomplete fare import' USING ERRCODE='23514';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER fare_import_complete AFTER INSERT ON fare.imports DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fare.complete_import();
CREATE FUNCTION fare.guard_matrix_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$ BEGIN
 IF NOT EXISTS(SELECT FROM fare.imports i WHERE i.id=NEW.import_id AND i.xmin::text=pg_current_xact_id()::text) THEN RAISE EXCEPTION 'Matrix import is immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
CREATE TRIGGER fare_matrix_insert BEFORE INSERT ON fare.matrix_rows FOR EACH ROW EXECUTE FUNCTION fare.guard_matrix_insert();
CREATE FUNCTION fare.audit_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE audit_id uuid:=gen_random_uuid();resource uuid;event text;
BEGIN
 resource:=NEW.id;event:='fare.'||TG_TABLE_NAME||CASE WHEN TG_OP='INSERT' THEN '.created' ELSE '.'||lower(to_jsonb(NEW)->>'state') END;
 INSERT INTO identity.audit_events(id,actor_user_id,actor_session_id,city_tenant_id,action,resource_id,outcome,reason_code,trace_id)
 VALUES(audit_id,nullif(current_setting('trissea.user_id',true),'')::uuid,nullif(current_setting('trissea.session_id',true),'')::uuid,NEW.city_tenant_id,event,resource,'COMPLETED','M3_SIMULATION_ONLY',gen_random_uuid());
 INSERT INTO identity.outbox_events(audit_event_id,aggregate_id,event_type) VALUES(audit_id,resource,event);RETURN NEW;
END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['sources','imports','policy_families','policy_versions','reviews','calculations'] LOOP
 EXECUTE format('CREATE TRIGGER fare_audit AFTER INSERT%s ON fare.%I FOR EACH ROW EXECUTE FUNCTION fare.audit_mutation()',CASE WHEN t='policy_versions' THEN ' OR UPDATE' ELSE '' END,t);
END LOOP;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fare FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA fare TO trissea_m2_admin_auth;
