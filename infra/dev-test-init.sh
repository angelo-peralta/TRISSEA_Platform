#!/usr/bin/env bash
set -euo pipefail
# This cluster holds only manifest-verified local/synthetic fixtures.
if [ "${TRISSEA_RESTORE_MODE:-false}" != true ]; then
  psql -X -q -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
CREATE DATABASE m2_control OWNER m2_test_owner;
\connect m2_control
CREATE EXTENSION IF NOT EXISTS postgis;
SQL
fi
