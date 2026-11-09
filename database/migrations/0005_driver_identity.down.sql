-- Disposable fixtures only; never cascade into unrelated data.
DROP FUNCTION identity.lock_driver_context(uuid,uuid,uuid);
DROP TABLE identity.driver_request_receipts;
DROP TABLE identity.driver_scope_assertions;
DROP TABLE identity.driver_vehicle_relationships;
DROP TABLE identity.driver_synthetic_vehicles;
DROP TABLE identity.driver_toda_affiliations;
DROP TABLE identity.driver_intake_scopes;
DROP TABLE identity.driver_profiles;
DROP FUNCTION identity.protect_driver_binding();
