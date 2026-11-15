-- Disposable simulation data only; export histories before any non-disposable rollback.
DROP SCHEMA simulation CASCADE;
DROP POLICY simulation_metadata ON identity.app_users;
DROP POLICY simulation_metadata ON identity.app_sessions;
DROP POLICY simulation_metadata ON identity.city_tenants;
DROP POLICY simulation_metadata ON identity.toda_organizations;
DROP POLICY simulation_reference ON fare.policy_versions;
DROP POLICY simulation_reference ON fare.policy_families;
DROP POLICY simulation_reference ON fare.imports;
DROP POLICY simulation_reference ON fare.matrix_rows;
REVOKE ALL ON fare.policy_versions,fare.policy_families,fare.imports,fare.matrix_rows FROM trissea_m4_writer;
REVOKE ALL ON identity.app_users,identity.app_sessions,identity.auth_identities,identity.city_tenants,identity.toda_organizations,identity.audit_events,identity.outbox_events FROM trissea_m4_writer;
REVOKE INSERT ON identity.audit_events,identity.outbox_events FROM trissea_m4_rides;
REVOKE EXECUTE ON FUNCTION fare.integer_value(jsonb,numeric,numeric) FROM trissea_m4_writer,trissea_m4_rides;
REVOKE USAGE ON SCHEMA fare,identity FROM trissea_m4_writer,trissea_m4_rides;
