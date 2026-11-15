-- Local synthetic Regular rides only. No operational grants, shifts, GPS or payable tariffs.
CREATE SCHEMA simulation;
REVOKE ALL ON SCHEMA simulation FROM PUBLIC;
DO $$ DECLARE r text;BEGIN FOREACH r IN ARRAY ARRAY['trissea_m4_rides','trissea_m4_writer'] LOOP
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',r);END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname=r AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit)) OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=r)) THEN RAISE EXCEPTION 'Unsafe simulation role';END IF;
END LOOP;END $$;
CREATE TABLE simulation.participants(
 user_id uuid NOT NULL REFERENCES identity.app_users(id),purpose text NOT NULL CHECK(purpose IN ('PASSENGER','DRIVER')),
 city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,reference text NOT NULL CHECK(reference LIKE 'SYNTHETIC_%'),
 state text NOT NULL DEFAULT 'ENABLED' CHECK(state IN ('ENABLED','DISABLED')),available boolean NOT NULL DEFAULT false,
 capacity integer CHECK(capacity BETWEEN 1 AND 5),rank integer NOT NULL DEFAULT 0,eta_seconds integer NOT NULL DEFAULT 120 CHECK(eta_seconds BETWEEN 0 AND 86400),
 PRIMARY KEY(user_id,purpose),UNIQUE(user_id,purpose,city_tenant_id,toda_id),
 FOREIGN KEY(city_tenant_id,toda_id) REFERENCES identity.toda_organizations(city_tenant_id,id),CHECK((purpose='DRIVER')=(capacity IS NOT NULL)));
CREATE TABLE simulation.scenarios(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,reference text NOT NULL CHECK(reference LIKE 'SYNTHETIC_%'),
 pickup text NOT NULL,destination text NOT NULL,origin text NOT NULL CHECK(origin IN ('PLAZA','OFF_PLAZA','POBLACION')),destination_label text,
 road_metres integer NOT NULL CHECK(road_metres BETWEEN 1 AND 1000000),capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 5),
 reference_policy_id uuid NOT NULL,private_policy_id uuid NOT NULL,enabled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 quote_seconds integer NOT NULL DEFAULT 120 CHECK(quote_seconds BETWEEN 1 AND 300),offer_seconds integer NOT NULL DEFAULT 30 CHECK(offer_seconds BETWEEN 1 AND 120),search_seconds integer NOT NULL DEFAULT 120 CHECK(search_seconds BETWEEN 1 AND 600),
 FOREIGN KEY(city_tenant_id,toda_id) REFERENCES identity.toda_organizations(city_tenant_id,id),
 FOREIGN KEY(city_tenant_id,reference_policy_id) REFERENCES fare.policy_versions(city_tenant_id,id),FOREIGN KEY(city_tenant_id,private_policy_id) REFERENCES fare.policy_versions(city_tenant_id,id),UNIQUE(id,city_tenant_id,toda_id));
CREATE TABLE simulation.quotes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES identity.app_users(id),scenario_id uuid NOT NULL,city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,
 scenario_version integer NOT NULL,reference_policy_id uuid NOT NULL,private_policy_id uuid NOT NULL,reference_revision integer NOT NULL,private_revision integer NOT NULL,
 passenger_count integer NOT NULL CHECK(passenger_count BETWEEN 1 AND 5),fare_class text NOT NULL CHECK(fare_class IN ('REGULAR','DISCOUNTED')),snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 FOREIGN KEY(scenario_id,city_tenant_id,toda_id) REFERENCES simulation.scenarios(id,city_tenant_id,toda_id),
 FOREIGN KEY(city_tenant_id,reference_policy_id) REFERENCES fare.policy_versions(city_tenant_id,id),FOREIGN KEY(city_tenant_id,private_policy_id) REFERENCES fare.policy_versions(city_tenant_id,id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes'),
 CHECK((snapshot->'payable'='false'::jsonb AND snapshot->'simulationOnly'='true'::jsonb AND snapshot->>'method'='PRIVATE_HIRE_PROPOSAL' AND fare.integer_value(snapshot->'totalCentavos',0,9007199254740991)) IS TRUE),UNIQUE(id,user_id));
CREATE TABLE simulation.rides(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),quote_id uuid NOT NULL UNIQUE,passenger_id uuid NOT NULL,driver_id uuid REFERENCES identity.app_users(id),
 city_tenant_id uuid NOT NULL,toda_id uuid NOT NULL,scenario_id uuid NOT NULL,state text NOT NULL DEFAULT 'REQUESTED',version integer NOT NULL DEFAULT 1 CHECK(version>0),
 search_until timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
 pickup_digest text,pickup_ciphertext text,pickup_attempts integer NOT NULL DEFAULT 0 CHECK(pickup_attempts BETWEEN 0 AND 5),pickup_verified boolean NOT NULL DEFAULT false,
 FOREIGN KEY(quote_id,passenger_id) REFERENCES simulation.quotes(id,user_id),FOREIGN KEY(scenario_id,city_tenant_id,toda_id) REFERENCES simulation.scenarios(id,city_tenant_id,toda_id),
 CHECK(state IN ('REQUESTED','SEARCHING','OFFERED','DRIVER_ASSIGNED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED','FAILED','NO_DRIVER_AVAILABLE')),
 CHECK(state NOT IN ('DRIVER_ASSIGNED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED') OR driver_id IS NOT NULL),CHECK(state<>'IN_PROGRESS' OR pickup_verified),CHECK(state<>'COMPLETED' OR (completed_at IS NOT NULL AND started_at IS NOT NULL AND pickup_verified)));
CREATE UNIQUE INDEX simulation_one_passenger ON simulation.rides(passenger_id) WHERE state NOT IN ('COMPLETED','CANCELLED','EXPIRED','FAILED','NO_DRIVER_AVAILABLE');
CREATE UNIQUE INDEX simulation_one_driver ON simulation.rides(driver_id) WHERE driver_id IS NOT NULL AND state NOT IN ('COMPLETED','CANCELLED','EXPIRED','FAILED','NO_DRIVER_AVAILABLE');
CREATE INDEX simulation_due ON simulation.rides(search_until) WHERE state IN ('SEARCHING','OFFERED');
CREATE TABLE simulation.offers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ride_id uuid NOT NULL REFERENCES simulation.rides(id),driver_id uuid NOT NULL REFERENCES identity.app_users(id),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 CHECK(expires_at>created_at),UNIQUE(ride_id,driver_id));
CREATE UNIQUE INDEX simulation_pending_driver ON simulation.offers(driver_id) WHERE state='PENDING';
CREATE UNIQUE INDEX simulation_winner ON simulation.offers(ride_id) WHERE state='ACCEPTED';
CREATE TABLE simulation.transitions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ride_id uuid NOT NULL REFERENCES simulation.rides(id),version integer NOT NULL,state text NOT NULL,actor_user_id uuid REFERENCES identity.app_users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(ride_id,version));
CREATE TABLE simulation.receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ride_id uuid NOT NULL UNIQUE REFERENCES simulation.rides(id),snapshot jsonb NOT NULL,cash_state text NOT NULL DEFAULT 'NOT_SIMULATED' CHECK(cash_state IN ('NOT_SIMULATED','COLLECTION_SIMULATED')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE simulation.cash_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),receipt_id uuid NOT NULL UNIQUE REFERENCES simulation.receipts(id),actor_user_id uuid NOT NULL REFERENCES identity.app_users(id),created_at timestamptz NOT NULL DEFAULT now(),state text NOT NULL DEFAULT 'COLLECTION_SIMULATED' CHECK(state='COLLECTION_SIMULATED'));
CREATE TABLE simulation.receipts_keys(user_id uuid NOT NULL REFERENCES identity.app_users(id),operation text NOT NULL,key_digest text NOT NULL,body_digest text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,operation,key_digest),CHECK(key_digest ~ '^[a-f0-9]{64}$' AND body_digest ~ '^[a-f0-9]{64}$'));
GRANT USAGE ON SCHEMA simulation,identity,fare TO trissea_m4_rides,trissea_m4_writer;
GRANT SELECT(id,state,auth_version) ON identity.app_users TO trissea_m4_writer;
GRANT SELECT(id,user_id,identity_id,identity_kind,client_purpose,state,auth_version,expires_at) ON identity.app_sessions TO trissea_m4_writer;
GRANT SELECT(id,user_id,kind,state) ON identity.auth_identities TO trissea_m4_writer;
GRANT SELECT(id,state) ON identity.city_tenants TO trissea_m4_writer;
GRANT SELECT(id,city_tenant_id,state) ON identity.toda_organizations TO trissea_m4_writer;
GRANT SELECT ON fare.policy_versions,fare.policy_families,fare.imports,fare.matrix_rows TO trissea_m4_writer;
GRANT INSERT ON identity.audit_events,identity.outbox_events TO trissea_m4_writer,trissea_m4_rides;
GRANT EXECUTE ON FUNCTION fare.integer_value(jsonb,numeric,numeric) TO trissea_m4_writer,trissea_m4_rides;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['participants','scenarios','quotes','rides','offers','transitions','receipts','cash_events','receipts_keys'] LOOP
  EXECUTE format('ALTER TABLE simulation.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE simulation.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON simulation.%I TO trissea_m4_writer',t);
  EXECUTE format('CREATE POLICY simulation_writer ON simulation.%I TO trissea_m4_writer USING(true) WITH CHECK(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['app_users','app_sessions','city_tenants','toda_organizations'] LOOP EXECUTE format('CREATE POLICY simulation_metadata ON identity.%I FOR SELECT TO trissea_m4_writer USING(true)',t);END LOOP;
 FOREACH t IN ARRAY ARRAY['policy_versions','policy_families','imports','matrix_rows'] LOOP EXECUTE format('CREATE POLICY simulation_reference ON fare.%I FOR SELECT TO trissea_m4_writer USING(true)',t);END LOOP;
END $$;
CREATE FUNCTION simulation.allowed(p_city uuid,p_toda uuid,p_purpose text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT FROM simulation.participants p JOIN identity.app_users u ON u.id=p.user_id JOIN identity.app_sessions s ON s.user_id=u.id JOIN identity.auth_identities i ON i.id=s.identity_id AND i.user_id=u.id JOIN identity.city_tenants c ON c.id=p.city_tenant_id JOIN identity.toda_organizations t ON t.id=p.toda_id AND t.city_tenant_id=c.id
 WHERE p.user_id::text=current_setting('trissea.user_id',true) AND s.id::text=current_setting('trissea.session_id',true) AND p.purpose=p_purpose AND s.client_purpose=p_purpose AND current_setting('trissea.client_purpose',true)=p_purpose
 AND p.city_tenant_id=p_city AND p.toda_id=p_toda AND p.state='ENABLED' AND u.state='ACTIVE' AND s.state='ACTIVE' AND s.auth_version=u.auth_version AND s.expires_at>clock_timestamp() AND i.state='ACTIVE' AND i.kind='PHONE_OTP' AND s.identity_kind='PHONE_OTP' AND c.state='ACTIVE' AND t.state='VERIFIED')
$$;
CREATE FUNCTION simulation.context() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT to_jsonb(p) FROM simulation.participants p WHERE p.user_id::text=current_setting('trissea.user_id',true) AND p.purpose=current_setting('trissea.client_purpose',true) AND simulation.allowed(p.city_tenant_id,p.toda_id,p.purpose) FOR UPDATE OF p
$$;
CREATE FUNCTION simulation.fare_context(p_scenario uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE s simulation.scenarios;v fare.policy_versions;pv fare.policy_versions;rows jsonb;source text;
BEGIN
 SELECT * INTO STRICT s FROM simulation.scenarios WHERE id=p_scenario AND enabled AND simulation.allowed(city_tenant_id,toda_id,'PASSENGER') FOR SHARE;
 -- Share M3's family locks so a newly saved/reviewed policy cannot slip between
 -- quote validation and confirmation. Stable ordering avoids two-family deadlocks.
 PERFORM pg_advisory_xact_lock(hashtextextended(family_id::text,903)) FROM fare.policy_versions WHERE id IN(s.reference_policy_id,s.private_policy_id) ORDER BY family_id;
 SELECT * INTO STRICT v FROM fare.policy_versions WHERE id=s.reference_policy_id;
 SELECT * INTO STRICT pv FROM fare.policy_versions WHERE id=s.private_policy_id AND kind='PRIVATE_HIRE_PROPOSAL';
 IF EXISTS(SELECT FROM fare.policy_versions WHERE family_id=v.family_id AND revision>v.revision) OR EXISTS(SELECT FROM fare.policy_versions WHERE family_id=pv.family_id AND revision>pv.revision) OR v.state='REJECTED' OR pv.state='REJECTED' THEN RAISE EXCEPTION 'STALE_POLICY' USING ERRCODE='23514';END IF;
 IF v.kind='LGU_MATRIX' THEN SELECT sha256 INTO source FROM fare.imports WHERE id=(v.config->>'importId')::uuid;
  SELECT jsonb_agg(jsonb_build_object('destinationLabel',destination_label,'category',category,'regularCentavos',regular_centavos,'discountedCentavos',discounted_centavos,'regularPhp',regular_php,'discountedPhp',discounted_php,'sourcePage',source_page,'originalStatus',original_status,'originalOriginScope',original_origin_scope,'originalEffectiveFrom',original_effective_from)) INTO rows FROM fare.matrix_rows WHERE import_id=(v.config->>'importId')::uuid;END IF;
 RETURN jsonb_build_object('scenario',to_jsonb(s),'reference',jsonb_build_object('id',v.id,'kind',v.kind,'config',v.config,'sourceVersion',source),'privatePolicy',jsonb_build_object('id',pv.id,'kind',pv.kind,'config',pv.config,'sourceVersion',NULL),'referenceRevision',v.lifecycle_version,'privateRevision',pv.lifecycle_version,'rows',coalesce(rows,'[]'::jsonb));
END $$;
CREATE FUNCTION simulation.visible_ride(p_ride uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT FROM simulation.rides r WHERE r.id=p_ride AND simulation.allowed(r.city_tenant_id,r.toda_id,current_setting('trissea.client_purpose',true)) AND
 ((current_setting('trissea.client_purpose',true)='PASSENGER' AND r.passenger_id::text=current_setting('trissea.user_id',true)) OR (current_setting('trissea.client_purpose',true)='DRIVER' AND (r.driver_id::text=current_setting('trissea.user_id',true) OR r.driver_id IS NULL AND EXISTS(SELECT FROM simulation.offers o WHERE o.ride_id=r.id AND o.state='PENDING' AND o.driver_id::text=current_setting('trissea.user_id',true))))))
$$;
GRANT SELECT ON simulation.scenarios,simulation.quotes,simulation.rides,simulation.offers,simulation.transitions,simulation.receipts,simulation.cash_events,simulation.receipts_keys TO trissea_m4_rides;
CREATE POLICY scenario_read ON simulation.scenarios FOR SELECT TO trissea_m4_rides USING(enabled AND simulation.allowed(city_tenant_id,toda_id,current_setting('trissea.client_purpose',true)));
CREATE POLICY quote_read ON simulation.quotes FOR SELECT TO trissea_m4_rides USING(user_id::text=current_setting('trissea.user_id',true) AND simulation.allowed(city_tenant_id,toda_id,'PASSENGER'));
CREATE POLICY ride_read ON simulation.rides FOR SELECT TO trissea_m4_rides USING(simulation.visible_ride(id));
CREATE POLICY offer_read ON simulation.offers FOR SELECT TO trissea_m4_rides USING(driver_id::text=current_setting('trissea.user_id',true) AND simulation.visible_ride(ride_id));
CREATE POLICY transition_read ON simulation.transitions FOR SELECT TO trissea_m4_rides USING(simulation.visible_ride(ride_id));
CREATE POLICY receipt_read ON simulation.receipts FOR SELECT TO trissea_m4_rides USING(simulation.visible_ride(ride_id));
CREATE POLICY cash_read ON simulation.cash_events FOR SELECT TO trissea_m4_rides USING(EXISTS(SELECT FROM simulation.receipts r WHERE r.id=receipt_id));
CREATE POLICY keys_read ON simulation.receipts_keys FOR SELECT TO trissea_m4_rides USING(user_id::text=current_setting('trissea.user_id',true));
GRANT INSERT ON simulation.quotes,simulation.receipts_keys TO trissea_m4_rides;
CREATE POLICY quote_insert ON simulation.quotes FOR INSERT TO trissea_m4_rides WITH CHECK(user_id::text=current_setting('trissea.user_id',true) AND simulation.allowed(city_tenant_id,toda_id,'PASSENGER'));
CREATE POLICY keys_insert ON simulation.receipts_keys FOR INSERT TO trissea_m4_rides WITH CHECK(user_id::text=current_setting('trissea.user_id',true));
CREATE FUNCTION simulation.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_SIMULATION_HISTORY' USING ERRCODE='23514';END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['quotes','transitions','receipts','cash_events','receipts_keys'] LOOP EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON simulation.%I FOR EACH ROW EXECUTE FUNCTION simulation.immutable()',t);END LOOP;END $$;
CREATE FUNCTION simulation.record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE audit_id uuid:=gen_random_uuid();event text;resource uuid;city uuid;
BEGIN
 IF TG_TABLE_NAME='rides' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.state=OLD.state THEN
    IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['pickup_attempts','pickup_verified','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['pickup_attempts','pickup_verified','version','updated_at']) THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';END IF;
   ELSIF NEW.version<>OLD.version+1 OR NEW.quote_id<>OLD.quote_id OR NEW.passenger_id<>OLD.passenger_id OR NEW.city_tenant_id<>OLD.city_tenant_id OR NEW.toda_id<>OLD.toda_id OR NEW.scenario_id<>OLD.scenario_id THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';END IF;
  END IF;
  INSERT INTO simulation.transitions(ride_id,version,state,actor_user_id) VALUES(NEW.id,NEW.version,NEW.state,nullif(current_setting('trissea.user_id',true),'')::uuid);
  city:=NEW.city_tenant_id;resource:=NEW.id;event:='ride.status.v1';
 ELSE
  IF TG_TABLE_NAME='cash_events' THEN SELECT ride_id INTO resource FROM simulation.receipts WHERE id=NEW.receipt_id;ELSE resource:=NEW.ride_id;END IF;
  SELECT city_tenant_id INTO city FROM simulation.rides WHERE id=resource;event:=CASE TG_TABLE_NAME WHEN 'offers' THEN 'ride.offer.v1' ELSE 'ride.simulation.receipt.v1' END;
 END IF;
 INSERT INTO identity.audit_events(id,actor_user_id,actor_session_id,city_tenant_id,action,resource_id,outcome,reason_code,trace_id) VALUES(audit_id,nullif(current_setting('trissea.user_id',true),'')::uuid,nullif(current_setting('trissea.session_id',true),'')::uuid,city,event,resource,'COMPLETED','M4_SYNTHETIC_ONLY',gen_random_uuid());
 INSERT INTO identity.outbox_events(audit_event_id,aggregate_id,event_type) VALUES(audit_id,resource,event);RETURN NEW;
END $$;
CREATE TRIGGER record_ride AFTER INSERT OR UPDATE ON simulation.rides FOR EACH ROW EXECUTE FUNCTION simulation.record();
CREATE TRIGGER record_offer AFTER INSERT OR UPDATE ON simulation.offers FOR EACH ROW EXECUTE FUNCTION simulation.record();
CREATE TRIGGER record_receipt AFTER INSERT ON simulation.receipts FOR EACH ROW EXECUTE FUNCTION simulation.record();
CREATE TRIGGER record_cash AFTER INSERT ON simulation.cash_events FOR EACH ROW EXECUTE FUNCTION simulation.record();
CREATE FUNCTION simulation.dispatch(p_ride uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r simulation.rides;s simulation.scenarios;d simulation.participants;q simulation.quotes;
BEGIN
 SELECT * INTO r FROM simulation.rides WHERE id=p_ride;IF NOT FOUND THEN RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.city_tenant_id::text||r.toda_id::text,410));
 SELECT * INTO r FROM simulation.rides WHERE id=p_ride FOR UPDATE;
 IF r.state NOT IN ('REQUESTED','SEARCHING','OFFERED') THEN RETURN;END IF;
 SELECT * INTO STRICT s FROM simulation.scenarios WHERE id=r.scenario_id;SELECT * INTO STRICT q FROM simulation.quotes WHERE id=r.quote_id;
 UPDATE simulation.offers SET state='EXPIRED' WHERE ride_id=r.id AND state='PENDING' AND expires_at<=clock_timestamp();
 IF EXISTS(SELECT FROM simulation.offers WHERE ride_id=r.id AND state='PENDING') THEN RETURN;END IF;
 IF r.state<>'SEARCHING' THEN UPDATE simulation.rides SET state='SEARCHING',version=version+1,updated_at=clock_timestamp() WHERE id=r.id;END IF;
 IF r.search_until>clock_timestamp() THEN
 SELECT * INTO d FROM simulation.participants p WHERE p.purpose='DRIVER' AND p.state='ENABLED' AND p.available AND EXISTS(SELECT FROM identity.app_users u WHERE u.id=p.user_id AND u.state='ACTIVE') AND p.city_tenant_id=r.city_tenant_id AND p.toda_id=r.toda_id AND p.capacity=s.capacity AND p.capacity>=q.passenger_count
 AND NOT EXISTS(SELECT FROM simulation.offers o WHERE o.driver_id=p.user_id AND (o.ride_id=r.id OR o.state='PENDING'))
 AND NOT EXISTS(SELECT FROM simulation.rides x WHERE x.driver_id=p.user_id AND x.state NOT IN ('COMPLETED','CANCELLED','EXPIRED','FAILED','NO_DRIVER_AVAILABLE')) ORDER BY p.rank,p.user_id LIMIT 1;
 END IF;
 IF d.user_id IS NULL THEN UPDATE simulation.rides SET state='NO_DRIVER_AVAILABLE',version=version+1,updated_at=clock_timestamp() WHERE id=r.id;
 ELSE INSERT INTO simulation.offers(ride_id,driver_id,expires_at) VALUES(r.id,d.user_id,least(clock_timestamp()+make_interval(secs=>s.offer_seconds),r.search_until));UPDATE simulation.rides SET state='OFFERED',version=version+1,updated_at=clock_timestamp() WHERE id=r.id;END IF;
END $$;
CREATE FUNCTION simulation.confirm(p_quote uuid,p_digest text,p_ciphertext text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE q simulation.quotes;s simulation.scenarios;ctx jsonb;ride uuid;
BEGIN
 SELECT * INTO STRICT q FROM simulation.quotes WHERE id=p_quote AND user_id::text=current_setting('trissea.user_id',true) AND simulation.allowed(city_tenant_id,toda_id,'PASSENGER');
 PERFORM pg_advisory_xact_lock(hashtextextended(q.city_tenant_id::text||q.toda_id::text,410));
 ctx:=simulation.fare_context(q.scenario_id);s:=jsonb_populate_record(NULL::simulation.scenarios,ctx->'scenario');
 IF q.expires_at<=clock_timestamp() OR q.scenario_version<>s.version OR q.reference_policy_id<>s.reference_policy_id OR q.private_policy_id<>s.private_policy_id OR q.reference_revision<>(ctx->>'referenceRevision')::integer OR q.private_revision<>(ctx->>'privateRevision')::integer THEN RAISE EXCEPTION 'QUOTE_STALE' USING ERRCODE='23514';END IF;
 IF p_digest !~ '^[a-f0-9]{64}$' OR p_ciphertext NOT LIKE 'v1.%' THEN RAISE EXCEPTION 'INVALID_PICKUP_PROOF';END IF;
 INSERT INTO simulation.rides(quote_id,passenger_id,city_tenant_id,toda_id,scenario_id,search_until,pickup_digest,pickup_ciphertext) VALUES(q.id,q.user_id,q.city_tenant_id,q.toda_id,q.scenario_id,clock_timestamp()+make_interval(secs=>s.search_seconds),p_digest,p_ciphertext) RETURNING id INTO ride;
 PERFORM simulation.dispatch(ride);RETURN ride;
END $$;
CREATE FUNCTION simulation.command(p_ride uuid,p_version integer,p_action text,p_offer uuid DEFAULT NULL,p_pickup_digest text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r simulation.rides;o simulation.offers;actor uuid:=nullif(current_setting('trissea.user_id',true),'')::uuid;purpose text:=current_setting('trissea.client_purpose',true);target text;
BEGIN
 SELECT * INTO STRICT r FROM simulation.rides WHERE id=p_ride AND simulation.visible_ride(id);
 PERFORM pg_advisory_xact_lock(hashtextextended(r.city_tenant_id::text||r.toda_id::text,410));SELECT * INTO r FROM simulation.rides WHERE id=p_ride FOR UPDATE;
 IF NOT simulation.allowed(r.city_tenant_id,r.toda_id,purpose) THEN RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE='42501';END IF;
 IF r.version<>p_version THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='23514';END IF;
 IF p_action IN ('ACCEPT','DECLINE') THEN
  SELECT * INTO STRICT o FROM simulation.offers WHERE id=p_offer AND ride_id=r.id AND driver_id=actor;
  IF purpose<>'DRIVER' OR r.state<>'OFFERED' OR o.state<>'PENDING' OR o.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'OFFER_CONFLICT' USING ERRCODE='23514';END IF;
  IF p_action='DECLINE' THEN UPDATE simulation.offers SET state='DECLINED' WHERE id=o.id;PERFORM simulation.dispatch(r.id);RETURN 'DECLINED';END IF;
  IF NOT EXISTS(SELECT FROM simulation.participants p JOIN simulation.scenarios s ON s.id=r.scenario_id WHERE p.user_id=actor AND p.purpose='DRIVER' AND p.available AND p.capacity=s.capacity) THEN RAISE EXCEPTION 'DRIVER_UNAVAILABLE' USING ERRCODE='23514';END IF;
  UPDATE simulation.offers SET state='ACCEPTED' WHERE id=o.id;
  UPDATE simulation.offers SET state='CANCELLED' WHERE ride_id=r.id AND state='PENDING';
  UPDATE simulation.rides SET driver_id=actor,state='DRIVER_ASSIGNED',version=version+1,updated_at=clock_timestamp() WHERE id=r.id;RETURN 'DRIVER_ASSIGNED';
 END IF;
 IF r.version<>p_version THEN RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='23514';END IF;
 IF p_action='CANCEL' THEN
  IF purpose<>'PASSENGER' OR r.passenger_id<>actor OR r.state IN ('IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED','FAILED','NO_DRIVER_AVAILABLE') THEN RAISE EXCEPTION 'CANCEL_DENIED' USING ERRCODE='23514';END IF;
  UPDATE simulation.offers SET state='CANCELLED' WHERE ride_id=r.id AND state='PENDING';target:='CANCELLED';
 ELSE
  IF purpose<>'DRIVER' OR r.driver_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'DRIVER_DENIED' USING ERRCODE='42501';END IF;
  target:=CASE WHEN p_action='EN_ROUTE' AND r.state='DRIVER_ASSIGNED' THEN 'DRIVER_EN_ROUTE' WHEN p_action='ARRIVED' AND r.state='DRIVER_EN_ROUTE' THEN 'DRIVER_ARRIVED' WHEN p_action='START' AND r.state='DRIVER_ARRIVED' AND r.pickup_verified THEN 'IN_PROGRESS' WHEN p_action='COMPLETE' AND r.state='IN_PROGRESS' THEN 'COMPLETED' END;
  IF p_action='VERIFY_PICKUP' AND r.state='DRIVER_ARRIVED' AND NOT r.pickup_verified AND r.pickup_attempts<5 THEN
   -- Record attempts even on an incorrect proof; returning a result allows the transaction to commit.
   UPDATE simulation.rides SET pickup_attempts=pickup_attempts+1,pickup_verified=coalesce(p_pickup_digest=r.pickup_digest,false),version=version+1,updated_at=clock_timestamp() WHERE id=r.id;
   RETURN CASE WHEN p_pickup_digest=r.pickup_digest THEN 'PICKUP_VERIFIED' ELSE 'PICKUP_REJECTED' END;
  END IF;
  IF p_action='CASH' AND r.state='COMPLETED' THEN INSERT INTO simulation.cash_events(receipt_id,actor_user_id) SELECT id,actor FROM simulation.receipts WHERE ride_id=r.id;UPDATE simulation.rides SET version=version+1,updated_at=clock_timestamp() WHERE id=r.id;RETURN 'COLLECTION_SIMULATED';END IF;
  IF target IS NULL THEN RAISE EXCEPTION 'TRANSITION_DENIED' USING ERRCODE='23514';END IF;
 END IF;
 UPDATE simulation.rides SET state=target,version=version+1,updated_at=clock_timestamp(),started_at=CASE WHEN target='IN_PROGRESS' THEN clock_timestamp() ELSE started_at END,completed_at=CASE WHEN target='COMPLETED' THEN clock_timestamp() ELSE completed_at END WHERE id=r.id;
 IF target='COMPLETED' THEN INSERT INTO simulation.receipts(ride_id,snapshot) SELECT r.id,jsonb_build_object('rideId',r.id,'passengerReference',(SELECT p.reference FROM simulation.participants p WHERE p.user_id=r.passenger_id AND p.purpose='PASSENGER'),'driverReference',(SELECT p.reference FROM simulation.participants p WHERE p.user_id=actor AND p.purpose='DRIVER'),'tripStartedAt',(SELECT started_at FROM simulation.rides WHERE id=r.id),'tripCompletedAt',clock_timestamp(),'fare',q.snapshot,'paymentMethod','CASH_SIMULATION','physicallyReceived',false,'settled',false) FROM simulation.quotes q WHERE q.id=r.quote_id;END IF;
 RETURN target;
END $$;
-- Pickup proof updates do not change the ride state; keep the version/event history explicit.
CREATE FUNCTION simulation.tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ DECLARE r record;BEGIN
 FOR r IN SELECT id FROM simulation.rides WHERE state IN ('REQUESTED','SEARCHING','OFFERED') ORDER BY created_at,id LIMIT 100 LOOP PERFORM simulation.dispatch(r.id);END LOOP;
END $$;
CREATE FUNCTION simulation.current_ride() RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT id FROM simulation.rides r WHERE state NOT IN ('COMPLETED','CANCELLED','EXPIRED','FAILED','NO_DRIVER_AVAILABLE') AND simulation.visible_ride(r.id) AND (r.passenger_id::text=current_setting('trissea.user_id',true) AND current_setting('trissea.client_purpose',true)='PASSENGER' OR r.driver_id::text=current_setting('trissea.user_id',true) AND current_setting('trissea.client_purpose',true)='DRIVER') ORDER BY created_at DESC,id LIMIT 1
$$;
CREATE FUNCTION simulation.snapshot(p_ride uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r simulation.rides;q simulation.quotes;receipt jsonb;driver text;
BEGIN
 SELECT * INTO STRICT r FROM simulation.rides WHERE id=p_ride AND simulation.visible_ride(id);SELECT * INTO STRICT q FROM simulation.quotes WHERE id=r.quote_id;
 SELECT p.reference INTO driver FROM simulation.participants p WHERE p.user_id=r.driver_id AND p.purpose='DRIVER';
 SELECT jsonb_build_object('id',x.id,'rideId',x.ride_id,'createdAt',x.created_at,'snapshot',x.snapshot,'cashState',CASE WHEN EXISTS(SELECT FROM simulation.cash_events e WHERE e.receipt_id=x.id) THEN 'COLLECTION_SIMULATED' ELSE 'NOT_SIMULATED' END) INTO receipt FROM simulation.receipts x WHERE x.ride_id=r.id;
 RETURN jsonb_build_object('id',r.id,'quoteId',r.quote_id,'state',r.state,'version',r.version,'cityTenantId',r.city_tenant_id,'todaId',r.toda_id,'createdAt',r.created_at,'updatedAt',r.updated_at,'searchUntil',r.search_until,'pickupVerified',r.pickup_verified,'pickupAttemptsRemaining',5-r.pickup_attempts,'driverReference',driver,'vehicleDescription',CASE WHEN driver IS NOT NULL THEN 'Synthetic tricycle; no real vehicle authority' ELSE NULL END,'fare',q.snapshot,'receipt',receipt);
END $$;
CREATE FUNCTION simulation.availability(p_available boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ BEGIN
 UPDATE simulation.participants SET available=p_available WHERE user_id::text=current_setting('trissea.user_id',true) AND purpose='DRIVER' AND simulation.allowed(city_tenant_id,toda_id,'DRIVER');IF NOT FOUND THEN RAISE EXCEPTION 'SIMULATION_SCOPE_DENIED' USING ERRCODE='42501';END IF;
END $$;
-- Only the trusted local scheduler invokes tick. HTTP users cannot select another user's ride.
GRANT CREATE ON SCHEMA simulation TO trissea_m4_writer;
DO $$ DECLARE f regprocedure;BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='simulation' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO trissea_m4_writer',f);END LOOP;END $$;
REVOKE CREATE ON SCHEMA simulation FROM trissea_m4_writer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA simulation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.allowed(uuid,uuid,text),simulation.context(),simulation.fare_context(uuid),simulation.visible_ride(uuid),simulation.confirm(uuid,text,text),simulation.command(uuid,integer,text,uuid,text),simulation.tick(),simulation.current_ride(),simulation.snapshot(uuid),simulation.availability(boolean) TO trissea_m4_rides;
