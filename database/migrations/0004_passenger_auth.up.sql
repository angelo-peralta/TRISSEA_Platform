-- Incremental local/synthetic passenger auth; no legacy SQL or real-user seed.
CREATE TABLE identity.phone_request_bindings(
 challenge_id uuid PRIMARY KEY REFERENCES identity.otp_challenge_metadata(id),request_key_digest text NOT NULL UNIQUE,request_digest text NOT NULL,
 ip_digest text NOT NULL,device_digest text NOT NULL,key_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT phone_request_digests CHECK(request_key_digest ~ '^[0-9a-f]{64}$' AND request_digest ~ '^[0-9a-f]{64}$' AND ip_digest ~ '^[0-9a-f]{64}$' AND device_digest ~ '^[0-9a-f]{64}$'));
CREATE INDEX phone_ip_budget_idx ON identity.phone_request_bindings(ip_digest,created_at);
CREATE INDEX phone_device_budget_idx ON identity.phone_request_bindings(device_digest,created_at);
CREATE TABLE identity.mobile_session_bindings(
 session_id uuid PRIMARY KEY,user_id uuid NOT NULL,purpose text NOT NULL,binding_digest text NOT NULL,key_id text NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT mobile_binding_session_user FOREIGN KEY(session_id,user_id) REFERENCES identity.app_sessions(id,user_id),
 CONSTRAINT mobile_binding_session_purpose FOREIGN KEY(session_id,purpose) REFERENCES identity.app_sessions(id,client_purpose),
 CONSTRAINT mobile_binding_values CHECK(purpose IN ('PASSENGER','DRIVER') AND binding_digest ~ '^[0-9a-f]{64}$' AND expires_at>created_at));
CREATE TABLE identity.auth_operation_results(
 scope_id uuid NOT NULL,operation text NOT NULL,idempotency_digest text NOT NULL,request_digest text NOT NULL,binding_digest text NOT NULL,
 result_ciphertext text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope_id,operation,idempotency_digest),
 CONSTRAINT auth_result_values CHECK(operation IN ('VERIFY','REFRESH') AND idempotency_digest ~ '^[0-9a-f]{64}$' AND request_digest ~ '^[0-9a-f]{64}$' AND binding_digest ~ '^[0-9a-f]{64}$' AND result_ciphertext LIKE 'v1.%'),
 CONSTRAINT auth_result_window CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 seconds'));
CREATE INDEX auth_result_expiry_idx ON identity.auth_operation_results(expires_at);
CREATE TABLE identity.passenger_profiles(
 user_id uuid PRIMARY KEY REFERENCES identity.app_users(id),display_name_ciphertext text,key_id text,mutation_digest text,version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT passenger_profile_values CHECK(version>0 AND (mutation_digest IS NULL OR mutation_digest ~ '^[0-9a-f]{64}$') AND ((display_name_ciphertext IS NULL AND key_id IS NULL) OR (display_name_ciphertext IS NOT NULL AND key_id IS NOT NULL AND key_id ~ '^[A-Za-z0-9_-]{1,32}$' AND display_name_ciphertext LIKE 'v1.'||key_id||'.%' AND display_name_ciphertext ~ '^v1[.][A-Za-z0-9_-]{1,32}[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$'))));
ALTER TABLE identity.passenger_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.passenger_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY passenger_profile_owner ON identity.passenger_profiles TO trissea_m2_auth
 USING(user_id::text=current_setting('trissea.user_id',true)) WITH CHECK(user_id::text=current_setting('trissea.user_id',true));
REVOKE ALL ON identity.phone_request_bindings,identity.mobile_session_bindings,identity.auth_operation_results,identity.passenger_profiles FROM PUBLIC;
GRANT SELECT,INSERT ON identity.phone_request_bindings,identity.mobile_session_bindings TO trissea_m2_auth;
GRANT SELECT,INSERT,DELETE ON identity.auth_operation_results TO trissea_m2_auth;
GRANT SELECT,INSERT,UPDATE ON identity.passenger_profiles TO trissea_m2_auth;
CREATE TRIGGER phone_request_immutable BEFORE UPDATE OR DELETE ON identity.phone_request_bindings FOR EACH ROW EXECUTE FUNCTION identity.reject_mutation();
CREATE TRIGGER mobile_binding_immutable BEFORE UPDATE OR DELETE ON identity.mobile_session_bindings FOR EACH ROW EXECUTE FUNCTION identity.reject_mutation();
