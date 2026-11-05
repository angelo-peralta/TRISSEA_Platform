-- Reviewed M2.1 identity foundation. No legacy SQL, users, grants or operator approvals.
CREATE SCHEMA identity;

CREATE TABLE identity."app_users" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "state" text DEFAULT 'CONSENT_REQUIRED' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "auth_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "restricted_at" timestamp with time zone,
  CONSTRAINT "users_state" CHECK ("state" IN ('CONSENT_REQUIRED','ACTIVE','RESTRICTED','CLOSED')),
  CONSTRAINT "users_versions" CHECK ("version" > 0 AND "auth_version" > 0),
  CONSTRAINT "users_restriction" CHECK (("state" IN ('RESTRICTED','CLOSED')) = ("restricted_at" IS NOT NULL))
);

CREATE TABLE identity."user_personas" (
  "user_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "state" text DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_personas_user_id_purpose_pk" PRIMARY KEY ("user_id", "purpose"),
  CONSTRAINT "personas_purpose" CHECK ("purpose" IN ('PASSENGER','DRIVER')),
  CONSTRAINT "personas_state" CHECK ("state" IN ('PENDING','ACTIVE','RESTRICTED'))
);

CREATE TABLE identity."auth_identities" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "issuer" text NOT NULL,
  "subject_digest" text NOT NULL,
  "key_id" text NOT NULL,
  "subject_ciphertext" text NOT NULL,
  "verified_at" timestamp with time zone NOT NULL,
  "state" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "identity_subject" UNIQUE ("issuer", "key_id", "subject_digest"),
  CONSTRAINT "identity_user_kind" UNIQUE ("id", "user_id", "kind"),
  CONSTRAINT "identity_kind" CHECK ("kind" IN ('PHONE_OTP','KEYCLOAK')),
  CONSTRAINT "identity_state" CHECK ("state" IN ('ACTIVE','DISABLED')),
  CONSTRAINT "identity_digest" CHECK ("subject_digest" ~ '^[0-9a-f]{64}$' AND "key_id" ~ '^[A-Za-z0-9_-]{1,32}$'),
  CONSTRAINT "identity_envelope" CHECK ("subject_ciphertext" LIKE 'v1.' || "key_id" || '.%' AND "subject_ciphertext" ~ '^v1[.][A-Za-z0-9_-]{1,32}[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$')
);

CREATE TABLE identity."city_tenants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "code" text NOT NULL CONSTRAINT "city_tenants_code_unique" UNIQUE,
  "name" text NOT NULL,
  "timezone" text DEFAULT 'Asia/Manila' NOT NULL,
  "state" text DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "city_state" CHECK ("state" IN ('PENDING','ACTIVE','SUSPENDED'))
);

CREATE TABLE identity."toda_organizations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "city_tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "state" text DEFAULT 'PENDING' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "toda_city_id" UNIQUE ("city_tenant_id", "id"),
  CONSTRAINT "toda_city_code" UNIQUE ("city_tenant_id", "code"),
  CONSTRAINT "toda_state" CHECK ("state" IN ('PENDING','VERIFIED','SUSPENDED','REVOKED')),
  CONSTRAINT "toda_version" CHECK ("version" > 0)
);

CREATE TABLE identity."city_memberships" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "city_tenant_id" uuid NOT NULL,
  "state" text DEFAULT 'PENDING' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "membership_user_city" UNIQUE ("user_id", "city_tenant_id"),
  CONSTRAINT "membership_state" CHECK ("state" IN ('PENDING','ACTIVE','SUSPENDED','REVOKED')),
  CONSTRAINT "membership_version" CHECK ("version" > 0),
  CONSTRAINT "membership_revoked" CHECK (("state" = 'REVOKED') = ("revoked_at" IS NOT NULL))
);

CREATE TABLE identity."roles" (
  "code" text NOT NULL PRIMARY KEY
);

CREATE TABLE identity."permissions" (
  "code" text NOT NULL PRIMARY KEY
);

CREATE TABLE identity."role_scopes" (
  "role_code" text NOT NULL,
  "scope_kind" text NOT NULL,
  CONSTRAINT "role_scopes_role_code_scope_kind_pk" PRIMARY KEY ("role_code", "scope_kind"),
  CONSTRAINT "role_scope_kind" CHECK ("scope_kind" IN ('SELF','CITY','TODA','PLATFORM'))
);

CREATE TABLE identity."role_permissions" (
  "role_code" text NOT NULL,
  "permission_code" text NOT NULL,
  CONSTRAINT "role_permissions_role_code_permission_code_pk" PRIMARY KEY ("role_code", "permission_code")
);

CREATE TABLE identity."scoped_role_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "city_tenant_id" uuid NOT NULL,
  "toda_id" uuid,
  "role_code" text NOT NULL,
  "scope_kind" text NOT NULL,
  "granted_by" uuid NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "grant_tuple" UNIQUE NULLS NOT DISTINCT ("user_id", "city_tenant_id", "toda_id", "role_code", "scope_kind"),
  CONSTRAINT "grant_scope" CHECK (("scope_kind" = 'TODA') = ("toda_id" IS NOT NULL)),
  CONSTRAINT "grant_no_self" CHECK ("granted_by" <> "user_id"),
  CONSTRAINT "grant_window" CHECK ("expires_at" > "starts_at" AND "version" > 0)
);

CREATE TABLE identity."app_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "identity_id" uuid NOT NULL,
  "identity_kind" text NOT NULL,
  "client_purpose" text NOT NULL,
  "state" text DEFAULT 'PREAUTH' NOT NULL,
  "auth_version" integer NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "authenticated_at" timestamp with time zone NOT NULL,
  "mfa_verified_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "session_user_id" UNIQUE ("id", "user_id"),
  CONSTRAINT "session_purpose_id" UNIQUE ("id", "client_purpose"),
  CONSTRAINT "session_purpose" CHECK (("client_purpose" IN ('PASSENGER','DRIVER') AND "identity_kind" = 'PHONE_OTP') OR ("client_purpose" = 'ADMIN' AND "identity_kind" = 'KEYCLOAK')),
  CONSTRAINT "session_state" CHECK ("state" IN ('PREAUTH','CONSENT_REQUIRED','ACTIVE','REVOKED','EXPIRED')),
  CONSTRAINT "session_admin_mfa" CHECK ("client_purpose" <> 'ADMIN' OR "state" <> 'ACTIVE' OR "mfa_verified_at" IS NOT NULL),
  CONSTRAINT "session_window" CHECK ("expires_at" > "authenticated_at" AND "auth_version" > 0 AND "version" > 0 AND ("mfa_verified_at" IS NULL OR ("mfa_verified_at" >= "authenticated_at" AND "mfa_verified_at" <= "last_seen_at"))),
  CONSTRAINT "session_revoked" CHECK (("state" = 'REVOKED') = ("revoked_at" IS NOT NULL))
);

CREATE TABLE identity."refresh_credentials" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "session_id" uuid NOT NULL,
  "generation" integer NOT NULL,
  "digest" text NOT NULL CONSTRAINT "refresh_credentials_digest_unique" UNIQUE,
  "key_id" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refresh_generation" UNIQUE ("session_id", "generation"),
  CONSTRAINT "refresh_values" CHECK ("generation" >= 0 AND "digest" ~ '^[0-9a-f]{64}$' AND "key_id" ~ '^[A-Za-z0-9_-]{1,32}$' AND "expires_at" > "created_at")
);

CREATE TABLE identity."otp_challenge_metadata" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "purpose" text NOT NULL,
  "destination_digest" text NOT NULL,
  "key_id" text NOT NULL,
  "binding_digest" text NOT NULL,
  "state" text DEFAULT 'PREPARED' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "resend_after" timestamp with time zone NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "challenge_purpose_id" UNIQUE ("id", "purpose"),
  CONSTRAINT "challenge_purpose" CHECK ("purpose" IN ('PASSENGER','DRIVER')),
  CONSTRAINT "challenge_state" CHECK ("state" IN ('PREPARED','SENDING','SENT','UNKNOWN','REDEEMED','FAILED','EXPIRED','SUPERSEDED')),
  CONSTRAINT "challenge_digests" CHECK ("destination_digest" ~ '^[0-9a-f]{64}$' AND "binding_digest" ~ '^[0-9a-f]{64}$' AND "key_id" ~ '^[A-Za-z0-9_-]{1,32}$'),
  CONSTRAINT "challenge_window" CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + interval '5 minutes' AND "resend_after" >= "created_at" + interval '60 seconds' AND "version" > 0)
);

CREATE TABLE identity."otp_redemptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "challenge_id" uuid NOT NULL CONSTRAINT "otp_redemptions_challenge_id_unique" UNIQUE,
  "purpose" text NOT NULL,
  "user_id" uuid NOT NULL,
  "session_id" uuid NOT NULL CONSTRAINT "otp_redemptions_session_id_unique" UNIQUE,
  "receipt_digest" text NOT NULL CONSTRAINT "otp_redemptions_receipt_digest_unique" UNIQUE,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "redemption_digest" CHECK ("receipt_digest" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE identity."account_consents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "document_code" text NOT NULL,
  "document_version" text NOT NULL,
  "decision" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "consent_version_decision" UNIQUE ("user_id", "purpose", "document_code", "document_version", "decision"),
  CONSTRAINT "consent_purpose" CHECK ("purpose" IN ('PASSENGER','DRIVER')),
  CONSTRAINT "consent_decision" CHECK ("decision" IN ('ACKNOWLEDGED','ACCEPTED','WITHDRAWN'))
);

CREATE TABLE identity."administrative_identity_mappings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "identity_id" uuid NOT NULL CONSTRAINT "administrative_identity_mappings_identity_id_unique" UNIQUE,
  "user_id" uuid NOT NULL,
  "identity_kind" text DEFAULT 'KEYCLOAK' NOT NULL,
  "approved_by" uuid NOT NULL,
  "approval_reference" uuid NOT NULL,
  "state" text DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_mapping_kind" CHECK ("identity_kind" = 'KEYCLOAK'),
  CONSTRAINT "admin_mapping_state" CHECK ("state" IN ('PENDING','APPROVED','REVOKED')),
  CONSTRAINT "admin_mapping_no_self" CHECK ("approved_by" <> "user_id")
);

CREATE TABLE identity."audit_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "actor_user_id" uuid,
  "actor_session_id" uuid,
  "city_tenant_id" uuid,
  "toda_id" uuid,
  "action" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "outcome" text NOT NULL,
  "reason_code" text NOT NULL,
  "trace_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_scope" CHECK ("toda_id" IS NULL OR "city_tenant_id" IS NOT NULL),
  CONSTRAINT "audit_actor" CHECK ("actor_session_id" IS NULL OR "actor_user_id" IS NOT NULL),
  CONSTRAINT "audit_codes" CHECK ("action" ~ '^[a-z][a-z0-9_.]{1,63}$' AND "reason_code" ~ '^[A-Z][A-Z0-9_]{1,63}$' AND "outcome" IN ('ALLOWED','DENIED','COMPLETED'))
);

CREATE TABLE identity."outbox_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "audit_event_id" uuid NOT NULL CONSTRAINT "outbox_events_audit_event_id_unique" UNIQUE,
  "aggregate_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "event_version" integer DEFAULT 1 NOT NULL,
  "state" text DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "outbox_state" CHECK ("state" IN ('PENDING','DELIVERED','DEAD_LETTER')),
  CONSTRAINT "outbox_values" CHECK ("attempts" >= 0 AND "event_version" > 0 AND "event_type" ~ '^[a-z][a-z0-9_.]{1,63}$')
);

ALTER TABLE identity."user_personas" ADD CONSTRAINT "user_personas_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."app_users" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."auth_identities" ADD CONSTRAINT "auth_identities_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."app_users" ("id") ON DELETE NO ACTION;
CREATE INDEX "identity_user_idx" ON identity."auth_identities" ("user_id");
ALTER TABLE identity."toda_organizations" ADD CONSTRAINT "toda_organizations_city_tenant_id_city_tenants_id_fk" FOREIGN KEY ("city_tenant_id") REFERENCES "identity"."city_tenants" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."city_memberships" ADD CONSTRAINT "city_memberships_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."app_users" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."city_memberships" ADD CONSTRAINT "city_memberships_city_tenant_id_city_tenants_id_fk" FOREIGN KEY ("city_tenant_id") REFERENCES "identity"."city_tenants" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."role_scopes" ADD CONSTRAINT "role_scopes_role_code_roles_code_fk" FOREIGN KEY ("role_code") REFERENCES "identity"."roles" ("code") ON DELETE NO ACTION;
ALTER TABLE identity."role_permissions" ADD CONSTRAINT "role_permissions_role_code_roles_code_fk" FOREIGN KEY ("role_code") REFERENCES "identity"."roles" ("code") ON DELETE NO ACTION;
ALTER TABLE identity."role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "identity"."permissions" ("code") ON DELETE NO ACTION;
ALTER TABLE identity."scoped_role_assignments" ADD CONSTRAINT "scoped_role_assignments_granted_by_app_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "identity"."app_users" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."scoped_role_assignments" ADD CONSTRAINT "grant_membership" FOREIGN KEY ("user_id", "city_tenant_id") REFERENCES "identity"."city_memberships" ("user_id", "city_tenant_id") ON DELETE NO ACTION;
ALTER TABLE identity."scoped_role_assignments" ADD CONSTRAINT "grant_toda_city" FOREIGN KEY ("city_tenant_id", "toda_id") REFERENCES "identity"."toda_organizations" ("city_tenant_id", "id") ON DELETE NO ACTION;
ALTER TABLE identity."scoped_role_assignments" ADD CONSTRAINT "grant_role_scope" FOREIGN KEY ("role_code", "scope_kind") REFERENCES "identity"."role_scopes" ("role_code", "scope_kind") ON DELETE NO ACTION;
CREATE INDEX "grant_scope_idx" ON identity."scoped_role_assignments" ("city_tenant_id", "toda_id", "user_id");
ALTER TABLE identity."app_sessions" ADD CONSTRAINT "app_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."app_users" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."app_sessions" ADD CONSTRAINT "session_identity_user" FOREIGN KEY ("identity_id", "user_id", "identity_kind") REFERENCES "identity"."auth_identities" ("id", "user_id", "kind") ON DELETE NO ACTION;
CREATE INDEX "session_user_idx" ON identity."app_sessions" ("user_id", "client_purpose", "state");
ALTER TABLE identity."refresh_credentials" ADD CONSTRAINT "refresh_credentials_session_id_app_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "identity"."app_sessions" ("id") ON DELETE NO ACTION;
CREATE INDEX "challenge_destination_idx" ON identity."otp_challenge_metadata" ("key_id", "destination_digest", "created_at");
ALTER TABLE identity."otp_redemptions" ADD CONSTRAINT "otp_redemptions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."app_users" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."otp_redemptions" ADD CONSTRAINT "redemption_challenge" FOREIGN KEY ("challenge_id", "purpose") REFERENCES "identity"."otp_challenge_metadata" ("id", "purpose") ON DELETE NO ACTION;
ALTER TABLE identity."otp_redemptions" ADD CONSTRAINT "redemption_session_user" FOREIGN KEY ("session_id", "user_id") REFERENCES "identity"."app_sessions" ("id", "user_id") ON DELETE NO ACTION;
ALTER TABLE identity."otp_redemptions" ADD CONSTRAINT "redemption_session_purpose" FOREIGN KEY ("session_id", "purpose") REFERENCES "identity"."app_sessions" ("id", "client_purpose") ON DELETE NO ACTION;
ALTER TABLE identity."account_consents" ADD CONSTRAINT "account_consents_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."app_users" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."administrative_identity_mappings" ADD CONSTRAINT "administrative_identity_mappings_approved_by_app_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "identity"."app_users" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."administrative_identity_mappings" ADD CONSTRAINT "admin_identity_user" FOREIGN KEY ("identity_id", "user_id", "identity_kind") REFERENCES "identity"."auth_identities" ("id", "user_id", "kind") ON DELETE NO ACTION;
ALTER TABLE identity."audit_events" ADD CONSTRAINT "audit_events_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "identity"."app_users" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."audit_events" ADD CONSTRAINT "audit_events_city_tenant_id_city_tenants_id_fk" FOREIGN KEY ("city_tenant_id") REFERENCES "identity"."city_tenants" ("id") ON DELETE NO ACTION;
ALTER TABLE identity."audit_events" ADD CONSTRAINT "audit_actor_session" FOREIGN KEY ("actor_session_id", "actor_user_id") REFERENCES "identity"."app_sessions" ("id", "user_id") ON DELETE NO ACTION;
ALTER TABLE identity."audit_events" ADD CONSTRAINT "audit_toda_city" FOREIGN KEY ("city_tenant_id", "toda_id") REFERENCES "identity"."toda_organizations" ("city_tenant_id", "id") ON DELETE NO ACTION;
CREATE INDEX "audit_scope_time_idx" ON identity."audit_events" ("city_tenant_id", "toda_id", "created_at");
ALTER TABLE identity."outbox_events" ADD CONSTRAINT "outbox_events_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "identity"."audit_events" ("id") ON DELETE NO ACTION;
CREATE INDEX "outbox_delivery_idx" ON identity."outbox_events" ("state", "available_at");
-- Catalogs reflect doc 37, but deliberately grant no operational permissions or users.
INSERT INTO identity.roles(code) VALUES
 ('PASSENGER'),('DRIVER'),('TODA_MANAGER'),('TODA_DISPATCHER'),('CITY_OPERATIONS_ADMIN'),
 ('CITY_FARE_EDITOR'),('CITY_FARE_APPROVER'),('VERIFICATION_OFFICER'),('SUPPORT_AGENT'),
 ('PRIVACY_OFFICER'),('SECURITY_AUDITOR'),('PLATFORM_ADMIN');
INSERT INTO identity.permissions(code) VALUES
 ('fare.draft'),('fare.approve'),('fare.activate'),('toda.members.manage'),('driver.verify'),
 ('rides.assist'),('rides.read.masked'),('gps.read.live'),('privacy.dsr'),('incidents.escalate'),('config.manage');
INSERT INTO identity.role_scopes(role_code,scope_kind) VALUES
 ('PASSENGER','SELF'),('DRIVER','SELF'),('TODA_MANAGER','TODA'),('TODA_DISPATCHER','TODA'),
 ('CITY_OPERATIONS_ADMIN','CITY'),('CITY_FARE_EDITOR','CITY'),('CITY_FARE_APPROVER','CITY'),
 ('VERIFICATION_OFFICER','CITY'),('VERIFICATION_OFFICER','TODA'),('SUPPORT_AGENT','CITY'),('SUPPORT_AGENT','TODA'),
 ('PRIVACY_OFFICER','CITY'),('SECURITY_AUDITOR','CITY'),('PLATFORM_ADMIN','PLATFORM');

-- Cluster groups have no passwords/login and own no tables. Provision actual logins separately.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['trissea_m2_runtime','trissea_m2_auth'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',role_name);
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname=role_name AND
      (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolinherit))
      OR EXISTS (SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=role_name))
    THEN RAISE EXCEPTION 'Unsafe pre-existing identity role'; END IF;
  END LOOP;
END $$;
REVOKE ALL ON SCHEMA identity FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA identity FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA identity FROM PUBLIC;
GRANT USAGE ON SCHEMA identity TO trissea_m2_runtime, trissea_m2_auth;
GRANT SELECT ON identity.roles,identity.permissions,identity.role_scopes,identity.role_permissions
 TO trissea_m2_runtime,trissea_m2_auth;
GRANT SELECT ON identity.app_users,identity.user_personas,identity.city_tenants,
 identity.toda_organizations,identity.city_memberships,identity.scoped_role_assignments,identity.account_consents
 TO trissea_m2_runtime;
GRANT SELECT(id,user_id,client_purpose,state,last_seen_at,expires_at,revoked_at) ON identity.app_sessions TO trissea_m2_runtime;
GRANT SELECT,INSERT,UPDATE ON identity.app_users,identity.user_personas,identity.auth_identities,
 identity.app_sessions,identity.refresh_credentials,identity.otp_challenge_metadata TO trissea_m2_auth;
GRANT SELECT,INSERT ON identity.otp_redemptions,identity.account_consents,identity.audit_events,identity.outbox_events TO trissea_m2_auth;
-- No runtime grants for role assignment, admin mapping, audit reads or arbitrary outbox updates.

-- RLS is defense in depth for future server-derived contexts; not a caller authentication oracle.
DO $$
DECLARE table_name text; expression text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['app_users','user_personas','city_tenants','toda_organizations',
   'city_memberships','scoped_role_assignments','account_consents','app_sessions'] LOOP
  EXECUTE format('ALTER TABLE identity.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE identity.%I FORCE ROW LEVEL SECURITY',table_name);
  expression := CASE
   WHEN table_name='app_users' THEN 'id::text = current_setting(''trissea.user_id'',true)'
   WHEN table_name IN ('user_personas','account_consents','app_sessions') THEN 'user_id::text = current_setting(''trissea.user_id'',true)'
   WHEN table_name='city_tenants' THEN 'id::text = current_setting(''trissea.city_tenant_id'',true)'
   WHEN table_name='toda_organizations' THEN 'city_tenant_id::text = current_setting(''trissea.city_tenant_id'',true) AND (current_setting(''trissea.toda_id'',true) = '''' OR id::text = current_setting(''trissea.toda_id'',true))'
   WHEN table_name='scoped_role_assignments' THEN 'user_id::text = current_setting(''trissea.user_id'',true) AND city_tenant_id::text = current_setting(''trissea.city_tenant_id'',true) AND (current_setting(''trissea.toda_id'',true) = '''' OR toda_id::text = current_setting(''trissea.toda_id'',true))'
   ELSE 'user_id::text = current_setting(''trissea.user_id'',true) AND city_tenant_id::text = current_setting(''trissea.city_tenant_id'',true)'
  END;
  EXECUTE format('CREATE POLICY scoped_read ON identity.%I FOR SELECT TO trissea_m2_runtime USING (%s)',table_name,expression);
  -- Auth writer never serves an HTTP request in M2.1; future auth module credential only.
  IF table_name IN ('app_users','user_personas','app_sessions') THEN
   EXECUTE format('CREATE POLICY auth_storage ON identity.%I TO trissea_m2_auth USING (true) WITH CHECK (true)',table_name);
  END IF;
  IF table_name='account_consents' THEN
   EXECUTE format('CREATE POLICY auth_storage ON identity.%I TO trissea_m2_auth USING (true) WITH CHECK (true)',table_name);
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION identity.reject_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Immutable identity history' USING ERRCODE='23514'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON identity.audit_events FOR EACH ROW EXECUTE FUNCTION identity.reject_mutation();
CREATE TRIGGER consent_immutable BEFORE UPDATE OR DELETE ON identity.account_consents FOR EACH ROW EXECUTE FUNCTION identity.reject_mutation();
CREATE TRIGGER redemption_immutable BEFORE UPDATE OR DELETE ON identity.otp_redemptions FOR EACH ROW EXECUTE FUNCTION identity.reject_mutation();

CREATE FUNCTION identity.protect_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='app_sessions' THEN
 IF
   (NEW.user_id,NEW.identity_id,NEW.identity_kind,NEW.client_purpose,NEW.auth_version,NEW.authenticated_at)
   IS DISTINCT FROM (OLD.user_id,OLD.identity_id,OLD.identity_kind,OLD.client_purpose,OLD.auth_version,OLD.authenticated_at)
 THEN RAISE EXCEPTION 'Immutable session binding' USING ERRCODE='23514'; END IF;
 IF OLD.state IN ('REVOKED','EXPIRED') AND NEW IS DISTINCT FROM OLD
 THEN RAISE EXCEPTION 'Terminal session state' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='auth_identities' THEN
 IF
   (NEW.user_id,NEW.kind,NEW.issuer,NEW.subject_digest,NEW.key_id,NEW.subject_ciphertext,NEW.verified_at)
   IS DISTINCT FROM (OLD.user_id,OLD.kind,OLD.issuer,OLD.subject_digest,OLD.key_id,OLD.subject_ciphertext,OLD.verified_at)
 THEN RAISE EXCEPTION 'Immutable identity binding' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER session_binding BEFORE UPDATE ON identity.app_sessions FOR EACH ROW EXECUTE FUNCTION identity.protect_binding();
CREATE TRIGGER identity_binding BEFORE UPDATE ON identity.auth_identities FOR EACH ROW EXECUTE FUNCTION identity.protect_binding();

CREATE FUNCTION identity.restrict_account() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE event_id uuid;
BEGIN
 IF OLD.state IN ('RESTRICTED','CLOSED') AND NEW.state NOT IN ('RESTRICTED','CLOSED')
 THEN RAISE EXCEPTION 'Account recovery is disabled' USING ERRCODE='23514'; END IF;
 IF NEW.auth_version <> OLD.auth_version OR NEW.version < OLD.version
 THEN RAISE EXCEPTION 'Invalid account version' USING ERRCODE='23514'; END IF;
 IF NEW.state IS DISTINCT FROM OLD.state AND NEW.state IN ('RESTRICTED','CLOSED') THEN
  NEW.auth_version := OLD.auth_version + 1;
  NEW.version := OLD.version + 1;
  NEW.restricted_at := statement_timestamp();
  UPDATE identity.app_sessions SET state='REVOKED',revoked_at=statement_timestamp(),version=version+1
   WHERE user_id=NEW.id AND state NOT IN ('REVOKED','EXPIRED');
  UPDATE identity.refresh_credentials SET revoked_at=statement_timestamp()
   WHERE session_id IN (SELECT id FROM identity.app_sessions WHERE user_id=NEW.id) AND revoked_at IS NULL;
  event_id := gen_random_uuid();
  INSERT INTO identity.audit_events(id,action,resource_id,outcome,reason_code,trace_id)
   VALUES(event_id,'account.restricted',NEW.id,'COMPLETED','ACCOUNT_RESTRICTION',gen_random_uuid());
  INSERT INTO identity.outbox_events(audit_event_id,aggregate_id,event_type)
   VALUES(event_id,NEW.id,'account.restricted');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER user_restriction BEFORE UPDATE ON identity.app_users FOR EACH ROW EXECUTE FUNCTION identity.restrict_account();

CREATE FUNCTION identity.revoke_session() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE event_id uuid;
BEGIN
 IF NEW.state='REVOKED' AND OLD.state<>'REVOKED' THEN
  UPDATE identity.refresh_credentials SET revoked_at=statement_timestamp() WHERE session_id=NEW.id AND revoked_at IS NULL;
  event_id := gen_random_uuid();
  INSERT INTO identity.audit_events(id,action,resource_id,outcome,reason_code,trace_id)
   VALUES(event_id,'session.revoked',NEW.id,'COMPLETED','SESSION_REVOCATION',gen_random_uuid());
  INSERT INTO identity.outbox_events(audit_event_id,aggregate_id,event_type) VALUES(event_id,NEW.id,'session.revoked');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER session_revocation AFTER UPDATE ON identity.app_sessions FOR EACH ROW EXECUTE FUNCTION identity.revoke_session();

CREATE FUNCTION identity.protect_refresh() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.session_id,NEW.generation,NEW.digest,NEW.key_id,NEW.created_at) IS DISTINCT FROM
    (OLD.session_id,OLD.generation,OLD.digest,OLD.key_id,OLD.created_at)
   OR (OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at)
   OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
 THEN RAISE EXCEPTION 'Immutable refresh binding or consumption' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refresh_binding BEFORE UPDATE ON identity.refresh_credentials FOR EACH ROW EXECUTE FUNCTION identity.protect_refresh();

-- Parent lock serializes session creation against restriction; a stale snapshot cannot issue access.
CREATE FUNCTION identity.check_session_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE account_state text; account_version integer;
BEGIN
 SELECT state,auth_version INTO account_state,account_version FROM identity.app_users WHERE id=NEW.user_id FOR UPDATE;
 IF account_state IS NULL OR account_state IN ('RESTRICTED','CLOSED') OR account_version <> NEW.auth_version
 THEN RAISE EXCEPTION 'Account cannot create session' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT FROM identity.auth_identities WHERE id=NEW.identity_id AND user_id=NEW.user_id AND state='ACTIVE')
 THEN RAISE EXCEPTION 'Identity cannot create session' USING ERRCODE='23514'; END IF;
 IF NEW.client_purpose='ADMIN' AND NEW.state='ACTIVE' AND NOT EXISTS
  (SELECT FROM identity.administrative_identity_mappings WHERE identity_id=NEW.identity_id AND user_id=NEW.user_id AND state='APPROVED')
 THEN RAISE EXCEPTION 'Admin mapping required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER session_account BEFORE INSERT ON identity.app_sessions FOR EACH ROW EXECUTE FUNCTION identity.check_session_insert();

CREATE FUNCTION identity.protect_outbox() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.id,NEW.audit_event_id,NEW.aggregate_id,NEW.event_type,NEW.event_version,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.audit_event_id,OLD.aggregate_id,OLD.event_type,OLD.event_version,OLD.created_at)
 THEN RAISE EXCEPTION 'Immutable outbox event' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER outbox_binding BEFORE UPDATE OR DELETE ON identity.outbox_events FOR EACH ROW EXECUTE FUNCTION identity.protect_outbox();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA identity FROM PUBLIC;
