import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { command, containers } from './dev-infra.mjs';

test('Linux private bootstrap preserves host privacy, runtime readability and immutable configuration', async () => {
  const current = await containers(), core = current.find(c => c.Config.Labels['com.docker.compose.service'] === 'postgres');
  assert.ok(core?.State.Running);
  const wrapper = await readFile(new URL('../infra/start-core-postgres.sh', import.meta.url), 'utf8');
  const boundary = wrapper.indexOf('install -d -m 750 -o postgres');
  assert.ok(boundary > 0);
  // Execute the real staging function against non-secret files, never DB data.
  const prefix = wrapper.slice(0, boundary), directory = '/tmp/trissea-bootstrap-test-' + randomBytes(12).toString('hex');
  const script = prefix + `
d='${directory}'
install -d -m 755 "$d"
trap 'rm -f "$d/source" "$d/other" "$d/pg/config" "$d/kc/config"; rmdir "$d/pg" "$d/kc" "$d"' EXIT
printf synthetic > "$d/source"
printf different > "$d/other"
chown 1001:1001 "$d/source" "$d/other"
chmod 600 "$d/source" "$d/other"
install -d -m 750 -o postgres -g postgres "$d/pg"
install -d -m 700 -o 1000 -g 0 "$d/kc"
stage_private "$d/source" "$d/pg/config" postgres postgres
stage_private "$d/source" "$d/kc/config" 1000 0
stage_private "$d/source" "$d/kc/config" 1000 0
test "$(stat -c %a "$d/source")" = 600
test "$(stat -c %u "$d/source")" = 1001
test "$(stat -c %a "$d/pg/config")" = 600
test "$(stat -c %a "$d/kc/config")" = 600
gosu postgres test -r "$d/pg/config"
gosu 1000:0 test -r "$d/kc/config"
if gosu postgres test -r "$d/source"; then exit 1; fi
if gosu 1000:0 test -r "$d/source"; then exit 1; fi
if gosu 33:33 test -r "$d/kc/config"; then exit 1; fi
if (stage_private "$d/other" "$d/kc/config" 1000 0); then exit 1; fi
cmp -s "$d/source" "$d/kc/config"
test "$(stat -c %a /run/trissea-private/core.sql)" = 600
gosu postgres test -r /run/trissea-private/core.sql
`;
  await command('docker', ['exec', '-i', '-u', '0', core.Id, 'bash'], { input: Buffer.from(script) });
  const idp = current.find(c => c.Config.Labels['com.docker.compose.service'] === 'keycloak');
  assert.ok(idp?.State.Running);
  await command('docker', ['exec', '-u', '1000:0', idp.Id, 'bash', '-ec', 'test -r /opt/keycloak/data/import/trissea-local-realm.json']);
});
