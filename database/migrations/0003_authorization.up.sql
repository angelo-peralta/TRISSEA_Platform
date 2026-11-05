-- M2.2 only: conservative doc-37 catalog edges, metadata-only resolver, narrow row-lock function.
-- No staff assignments, delegation endpoint, OTP, operational table or provider activation.
INSERT INTO identity.role_permissions(role_code,permission_code) VALUES
 ('CITY_OPERATIONS_ADMIN','config.manage'),('CITY_FARE_EDITOR','fare.draft'),('CITY_FARE_APPROVER','fare.approve'),
 ('TODA_MANAGER','toda.members.manage'),('TODA_DISPATCHER','rides.read.masked'),('TODA_DISPATCHER','rides.assist'),
 ('VERIFICATION_OFFICER','driver.verify'),('SUPPORT_AGENT','rides.read.masked'),('SUPPORT_AGENT','incidents.escalate'),
 ('PRIVACY_OFFICER','privacy.dsr'),('PLATFORM_ADMIN','config.manage');

DO $$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['trissea_m2_authorization','trissea_m2_policy_lock'] LOOP
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',role_name);
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname=role_name AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit))
    OR EXISTS (SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=role_name))
  THEN RAISE EXCEPTION 'Unsafe pre-existing authorization role'; END IF;
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA identity TO trissea_m2_authorization,trissea_m2_policy_lock;
GRANT SELECT(id,state,auth_version,version) ON identity.app_users TO trissea_m2_authorization;
GRANT SELECT(id,user_id,kind,state) ON identity.auth_identities TO trissea_m2_authorization;
GRANT SELECT ON identity.user_personas,identity.city_memberships,identity.scoped_role_assignments,
 identity.roles,identity.permissions,identity.role_permissions TO trissea_m2_authorization;
GRANT SELECT(id,user_id,identity_id,identity_kind,client_purpose,state,auth_version,version,authenticated_at,mfa_verified_at,last_seen_at,expires_at)
 ON identity.app_sessions TO trissea_m2_authorization;
GRANT SELECT(id,state) ON identity.city_tenants TO trissea_m2_authorization;
GRANT SELECT(id,city_tenant_id,state,version) ON identity.toda_organizations TO trissea_m2_authorization;
GRANT SELECT(identity_id,user_id,state) ON identity.administrative_identity_mappings TO trissea_m2_authorization;
GRANT INSERT ON identity.audit_events TO trissea_m2_authorization;

CREATE POLICY resolver_user ON identity.app_users FOR SELECT TO trissea_m2_authorization USING(id::text=current_setting('trissea.user_id',true));
CREATE POLICY resolver_persona ON identity.user_personas FOR SELECT TO trissea_m2_authorization USING(user_id::text=current_setting('trissea.user_id',true));
CREATE POLICY resolver_session ON identity.app_sessions FOR SELECT TO trissea_m2_authorization USING(user_id::text=current_setting('trissea.user_id',true));
CREATE POLICY resolver_membership ON identity.city_memberships FOR SELECT TO trissea_m2_authorization USING(user_id::text=current_setting('trissea.user_id',true) AND city_tenant_id::text=current_setting('trissea.city_tenant_id',true));
CREATE POLICY resolver_grant ON identity.scoped_role_assignments FOR SELECT TO trissea_m2_authorization USING(user_id::text=current_setting('trissea.user_id',true) AND city_tenant_id::text=current_setting('trissea.city_tenant_id',true));
-- Locator access has only opaque IDs/scope/state; names and private identity fields remain unavailable.
CREATE POLICY resolver_city ON identity.city_tenants FOR SELECT TO trissea_m2_authorization USING(true);
CREATE POLICY resolver_toda ON identity.toda_organizations FOR SELECT TO trissea_m2_authorization USING(true);

-- PostgreSQL row locks require UPDATE privilege. Confine it to a NOLOGIN function
-- owner, not the application group. No application role may SET ROLE to this owner.
GRANT SELECT(id),UPDATE(version) ON identity.app_users TO trissea_m2_policy_lock;
GRANT SELECT(id,user_id,identity_id),UPDATE(version) ON identity.app_sessions TO trissea_m2_policy_lock;
GRANT SELECT(id,user_id),UPDATE(state) ON identity.auth_identities TO trissea_m2_policy_lock;
GRANT SELECT(identity_id,user_id),UPDATE(state) ON identity.administrative_identity_mappings TO trissea_m2_policy_lock;
GRANT SELECT(id),UPDATE(state) ON identity.city_tenants TO trissea_m2_policy_lock;
GRANT SELECT(id,city_tenant_id),UPDATE(version) ON identity.toda_organizations TO trissea_m2_policy_lock;
GRANT SELECT(user_id,city_tenant_id),UPDATE(version) ON identity.city_memberships TO trissea_m2_policy_lock;
GRANT SELECT(user_id,city_tenant_id,id,role_code),UPDATE(version) ON identity.scoped_role_assignments TO trissea_m2_policy_lock;
GRANT SELECT,UPDATE ON identity.role_permissions TO trissea_m2_policy_lock;
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['app_users','app_sessions','city_tenants','toda_organizations','city_memberships','scoped_role_assignments'] LOOP
  EXECUTE format('CREATE POLICY policy_lock_rows ON identity.%I TO trissea_m2_policy_lock USING (true) WITH CHECK (false)',name);
 END LOOP;
END $$;

CREATE FUNCTION identity.lock_authorization_context(p_user uuid,p_session uuid,p_city uuid,p_toda uuid,p_permission text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE identity_ref uuid;
BEGIN
 IF p_user::text IS DISTINCT FROM current_setting('trissea.user_id',true)
    OR p_session::text IS DISTINCT FROM current_setting('trissea.session_id',true)
    OR coalesce(p_city::text,'') IS DISTINCT FROM current_setting('trissea.city_tenant_id',true)
    OR coalesce(p_toda::text,'') IS DISTINCT FROM current_setting('trissea.toda_id',true)
 THEN RAISE EXCEPTION 'Invalid authorization lock context' USING ERRCODE='42501'; END IF;
 PERFORM id FROM identity.app_users WHERE id=p_user FOR SHARE;
 SELECT identity_id INTO identity_ref FROM identity.app_sessions WHERE id=p_session AND user_id=p_user;
 PERFORM id FROM identity.auth_identities WHERE id=identity_ref AND user_id=p_user FOR SHARE;
 PERFORM id FROM identity.app_sessions WHERE id=p_session AND user_id=p_user FOR SHARE;
 PERFORM identity_id FROM identity.administrative_identity_mappings WHERE identity_id=identity_ref AND user_id=p_user FOR SHARE;
 IF p_city IS NOT NULL THEN
  PERFORM id FROM identity.city_tenants WHERE id=p_city FOR SHARE;
  PERFORM user_id FROM identity.city_memberships WHERE user_id=p_user AND city_tenant_id=p_city FOR SHARE;
  IF p_toda IS NOT NULL THEN PERFORM id FROM identity.toda_organizations WHERE id=p_toda AND city_tenant_id=p_city FOR SHARE; END IF;
  PERFORM id FROM identity.scoped_role_assignments WHERE user_id=p_user AND city_tenant_id=p_city ORDER BY id FOR SHARE;
  IF p_permission IS NOT NULL THEN LOCK TABLE identity.role_permissions IN SHARE MODE; END IF;
 END IF;
END $$;
GRANT CREATE ON SCHEMA identity TO trissea_m2_policy_lock;
ALTER FUNCTION identity.lock_authorization_context(uuid,uuid,uuid,uuid,text) OWNER TO trissea_m2_policy_lock;
REVOKE CREATE ON SCHEMA identity FROM trissea_m2_policy_lock;
REVOKE ALL ON FUNCTION identity.lock_authorization_context(uuid,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lock_authorization_context(uuid,uuid,uuid,uuid,text) TO trissea_m2_authorization;
