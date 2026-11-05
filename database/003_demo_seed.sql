-- Synthetic development demo only. Not a valid operator, actual terminal or legal permit.
-- Run after 001_core.sql on disposable local database.
BEGIN;
INSERT INTO tenants(id,slug,name,status,region_code)
VALUES ('11111111-1111-4111-8111-111111111111','demo-cagayan','TRISSEA Synthetic Demo','PENDING','02')
ON CONFLICT (id) DO NOTHING;
INSERT INTO terminals(id,tenant_id,name,terminal_point,checkin_radius_m,enabled)
VALUES ('22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
        'Synthetic Terminal (NOT a real pickup location)',
        ST_SetSRID(ST_MakePoint(121.728,17.614),4326)::geography,
        100,false)
ON CONFLICT (id) DO NOTHING;
COMMIT;
-- Coordinates are generic illustrative city-level synthetic sample, not an approved terminal.
