#!/usr/bin/env bash
set -euo pipefail
# Runs only for a NEW PostgreSQL volume. Never reinitializes retained data.
if [ "${TRISSEA_RESTORE_MODE:-false}" != true ]; then
  psql -X -q -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -f /run/trissea/core.sql
fi
