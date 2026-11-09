-- Dedicated disposable test DB only; prior M1/M2.1 tables and data are retained.
DROP FUNCTION identity.lock_authorization_context(uuid,uuid,uuid,uuid,text);
DROP POLICY resolver_user ON identity.app_users;
DROP POLICY resolver_persona ON identity.user_personas;
DROP POLICY resolver_session ON identity.app_sessions;
DROP POLICY resolver_membership ON identity.city_memberships;
DROP POLICY resolver_grant ON identity.scoped_role_assignments;
DROP POLICY resolver_city ON identity.city_tenants;
DROP POLICY resolver_toda ON identity.toda_organizations;
DROP POLICY policy_lock_rows ON identity.app_users;
DROP POLICY policy_lock_rows ON identity.app_sessions;
DROP POLICY policy_lock_rows ON identity.city_tenants;
DROP POLICY policy_lock_rows ON identity.toda_organizations;
DROP POLICY policy_lock_rows ON identity.city_memberships;
DROP POLICY policy_lock_rows ON identity.scoped_role_assignments;
REVOKE ALL ON ALL TABLES IN SCHEMA identity FROM trissea_m2_authorization,trissea_m2_policy_lock;
-- Table-level REVOKE does not remove column grants. Remove those explicitly too.
DO $$
DECLARE relation record;
BEGIN
 FOR relation IN SELECT c.relname,string_agg(quote_ident(a.attname),',' ORDER BY a.attnum) AS columns
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
   WHERE n.nspname='identity' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname LOOP
  EXECUTE format('REVOKE ALL (%s) ON identity.%I FROM trissea_m2_authorization,trissea_m2_policy_lock',relation.columns,relation.relname);
 END LOOP;
END $$;
REVOKE USAGE ON SCHEMA identity FROM trissea_m2_authorization,trissea_m2_policy_lock;
DELETE FROM identity.role_permissions WHERE (role_code,permission_code) IN (
 ('CITY_OPERATIONS_ADMIN','config.manage'),('CITY_FARE_EDITOR','fare.draft'),('CITY_FARE_APPROVER','fare.approve'),
 ('TODA_MANAGER','toda.members.manage'),('TODA_DISPATCHER','rides.read.masked'),('TODA_DISPATCHER','rides.assist'),
 ('VERIFICATION_OFFICER','driver.verify'),('SUPPORT_AGENT','rides.read.masked'),('SUPPORT_AGENT','incidents.escalate'),
 ('PRIVACY_OFFICER','privacy.dsr'),('PLATFORM_ADMIN','config.manage'));
-- Retain NOLOGIN groups; no destructive cluster-role cleanup.
