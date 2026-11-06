CREATE TABLE identity.admin_oidc_flows(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_digest text NOT NULL UNIQUE,proof_digest text NOT NULL,state_digest text NOT NULL UNIQUE,binding_digest text NOT NULL,secret_ciphertext text NOT NULL,ip_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,used_at timestamptz,
 CONSTRAINT admin_flow_values CHECK(request_digest ~ '^[0-9a-f]{64}$' AND proof_digest ~ '^[0-9a-f]{64}$' AND state_digest ~ '^[0-9a-f]{64}$' AND binding_digest ~ '^[0-9a-f]{64}$' AND ip_digest ~ '^[0-9a-f]{64}$' AND secret_ciphertext LIKE 'v1.%' AND expires_at>created_at AND expires_at<=created_at+interval '5 minutes'));
CREATE INDEX admin_flow_expiry_idx ON identity.admin_oidc_flows(expires_at);
CREATE INDEX admin_flow_budget_idx ON identity.admin_oidc_flows(ip_digest,created_at);
CREATE TABLE identity.admin_browser_sessions(
 session_id uuid PRIMARY KEY,cookie_digest text NOT NULL UNIQUE,csrf_digest text NOT NULL,provider_ciphertext text NOT NULL,factor_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT admin_browser_session FOREIGN KEY(session_id) REFERENCES identity.app_sessions(id),
 CONSTRAINT admin_browser_values CHECK(cookie_digest ~ '^[0-9a-f]{64}$' AND csrf_digest ~ '^[0-9a-f]{64}$' AND factor_digest ~ '^[0-9a-f]{64}$' AND provider_ciphertext LIKE 'v1.%'));
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_admin_auth') THEN CREATE ROLE trissea_m2_admin_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_admin_auth' AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit))
 OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='trissea_m2_admin_auth')) THEN RAISE EXCEPTION 'Unsafe admin auth role'; END IF;
END $$;
GRANT USAGE ON SCHEMA identity TO trissea_m2_admin_auth;
REVOKE ALL ON identity.admin_oidc_flows,identity.admin_browser_sessions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON identity.admin_oidc_flows TO trissea_m2_admin_auth;
GRANT SELECT,INSERT ON identity.admin_browser_sessions TO trissea_m2_admin_auth;
GRANT SELECT(id,state,auth_version,version),UPDATE(version) ON identity.app_users TO trissea_m2_admin_auth;
GRANT SELECT ON identity.auth_identities,identity.administrative_identity_mappings TO trissea_m2_admin_auth;
GRANT SELECT,INSERT,UPDATE ON identity.app_sessions TO trissea_m2_admin_auth;
GRANT SELECT(session_id,revoked_at),UPDATE(revoked_at) ON identity.refresh_credentials TO trissea_m2_admin_auth;
GRANT INSERT ON identity.audit_events,identity.outbox_events TO trissea_m2_admin_auth;
CREATE POLICY admin_auth_user ON identity.app_users FOR SELECT TO trissea_m2_admin_auth USING(id::text=current_setting('trissea.user_id',true));
CREATE POLICY admin_auth_user_lock ON identity.app_users FOR UPDATE TO trissea_m2_admin_auth USING(id::text=current_setting('trissea.user_id',true)) WITH CHECK(false);
CREATE POLICY admin_auth_sessions ON identity.app_sessions TO trissea_m2_admin_auth USING(client_purpose='ADMIN') WITH CHECK(client_purpose='ADMIN' AND identity_kind='KEYCLOAK');
CREATE TRIGGER admin_browser_immutable BEFORE UPDATE OR DELETE ON identity.admin_browser_sessions FOR EACH ROW EXECUTE FUNCTION identity.reject_mutation();
CREATE FUNCTION identity.protect_admin_flow() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.used_at IS NOT NULL OR NEW.used_at IS NULL OR (NEW.id,NEW.request_digest,NEW.proof_digest,NEW.state_digest,NEW.binding_digest,NEW.secret_ciphertext,NEW.created_at,NEW.expires_at,NEW.ip_digest)
 IS DISTINCT FROM (OLD.id,OLD.request_digest,OLD.proof_digest,OLD.state_digest,OLD.binding_digest,OLD.secret_ciphertext,OLD.created_at,OLD.expires_at,OLD.ip_digest) THEN RAISE EXCEPTION 'Immutable/consumed OIDC flow' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER admin_flow_consumption BEFORE UPDATE ON identity.admin_oidc_flows FOR EACH ROW EXECUTE FUNCTION identity.protect_admin_flow();
CREATE FUNCTION identity.lock_admin_identity(p_user uuid,p_identity uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_user::text IS DISTINCT FROM current_setting('trissea.user_id',true) THEN RAISE EXCEPTION 'Invalid admin identity context' USING ERRCODE='42501'; END IF;
 PERFORM id FROM identity.auth_identities WHERE id=p_identity AND user_id=p_user FOR SHARE;
 PERFORM identity_id FROM identity.administrative_identity_mappings WHERE identity_id=p_identity AND user_id=p_user FOR SHARE;
END $$;
GRANT CREATE ON SCHEMA identity TO trissea_m2_policy_lock;
ALTER FUNCTION identity.lock_admin_identity(uuid,uuid) OWNER TO trissea_m2_policy_lock;
REVOKE CREATE ON SCHEMA identity FROM trissea_m2_policy_lock;
REVOKE ALL ON FUNCTION identity.lock_admin_identity(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.lock_admin_identity(uuid,uuid) TO trissea_m2_admin_auth;
