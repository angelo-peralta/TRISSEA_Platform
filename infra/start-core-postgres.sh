#!/usr/bin/env bash
set -euo pipefail
# The official image starts as root, prepares ownership, then drops to postgres.
# Host artifacts stay 0600: Linux runner UID need not match either runtime UID.
if [ "$(id -u)" != 0 ]; then
  echo 'Private bootstrap staging requires the standard image entrypoint user.' >&2
  exit 1
fi
stage_private() {
  local source="$1" target="$2" owner="$3" group="$4"
  if [ -e "$target" ]; then
    if ! cmp -s "$source" "$target"; then
      echo 'Retained private bootstrap configuration differs; explicit review required.' >&2
      exit 1
    fi
    chown "$owner:$group" "$target"
    chmod 600 "$target"
  else
    install -m 600 -o "$owner" -g "$group" "$source" "$target"
  fi
}
install -d -m 750 -o postgres -g postgres /run/trissea-private
stage_private /run/trissea/core.sql /run/trissea-private/core.sql postgres postgres
install -d -m 700 -o 1000 -g 0 /run/trissea-realm-import
stage_private /run/trissea-realm-source/trissea-local-realm.json /run/trissea-realm-import/trissea-local-realm.json 1000 0
exec /usr/local/bin/docker-entrypoint.sh "$@"
