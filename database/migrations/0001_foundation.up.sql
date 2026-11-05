-- Local M1 foundation only. Historical 001_core.sql and *_REFERENCE.sql are not applied.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE foundation_metadata (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO foundation_metadata(key, value) VALUES ('milestone', 'M1');
