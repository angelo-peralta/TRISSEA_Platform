import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { parseEnv } from 'node:util';
import { sanitizeLogs, normalizeBindSource } from '../scripts/dev-infra.mjs';
import { renderCoreInit } from '../scripts/prepare-dev-infra.mjs';

const compose = parse(await readFile(new URL('../infra/compose.dev.yml', import.meta.url), 'utf8'));
test('one canonical project isolates core and fixture PostgreSQL services with persistent data', () => {
  assert.equal(compose.name, 'trissea-dev');
  assert.deepEqual(Object.keys(compose.services).sort(), ['keycloak', 'postgres', 'postgres-test', 'redis']);
  const core = compose.services.postgres, fixture = compose.services['postgres-test'];
  assert.equal(core.networks.some(n => fixture.networks.includes(n)), false);
  for (const s of [core, fixture, compose.services.redis]) { assert.equal(s.tmpfs, undefined); assert.ok(s.volumes.some(v => /_data:/.test(v))); }
  assert.equal(compose.networks.core.internal, true); assert.equal(compose.networks.test.internal, true);
});
test('images are pinned, all published ports are loopback and every service has a health check', () => {
  for (const service of Object.values(compose.services)) {
    assert.match(service.image, /@sha256:[0-9a-f]{64}$/);
    assert.ok(service.ports.every(p => p.startsWith('127.0.0.1:')));
    assert.ok(service.healthcheck.test.length > 0);
    assert.ok(service.volumes.every(p => !p.includes('TRISSEA_Platform_m2_identity')));
  }
  assert.equal(compose.services.keycloak.depends_on.postgres.condition, 'service_healthy');
});
test('database bootstrap credentials are separate secrets and Keycloak uses only its runtime database role', () => {
  assert.notEqual(compose.services.postgres.environment.POSTGRES_PASSWORD_FILE, compose.services['postgres-test'].environment.POSTGRES_PASSWORD_FILE);
  assert.equal(compose.services.postgres.environment.POSTGRES_PASSWORD, undefined);
  assert.equal(compose.services['postgres-test'].environment.POSTGRES_PASSWORD, undefined);
  assert.equal(compose.services.keycloak.environment.KC_DB_USERNAME, 'keycloak_runtime');
  assert.match(compose.services.keycloak.environment.KC_DB_URL, /\/keycloak_identity$/);
  assert.deepEqual(compose.services.keycloak.command, ['start-dev', '--import-realm']);
});
test('log projection emits lifecycle metadata while excluding SQL, authentication material and appended secrets', () => {
  const raw = 'postgres-test-1 | database system is ready to accept connections private_marker\nredis-1 | Ready to accept connections tcp private_marker\nkeycloak-1 | authentication private_marker\npostgres-1 | SQL private_marker';
  const result = sanitizeLogs(raw);
  assert.deepEqual(result.events, [{ service: 'postgres-test', event: 'database_ready' }, { service: 'redis', event: 'redis_ready' }]);
  assert.equal(result.suppressedUnrecognizedLines, 2);
  assert.equal(JSON.stringify(result).includes('private_marker'), false);
});
test('Docker Desktop bind spelling normalizes without treating sibling paths as primary paths', () => {
  assert.equal(normalizeBindSource('infra/compose.dev.yml'), resolve('infra/compose.dev.yml'));
  if (process.platform === 'win32') assert.equal(normalizeBindSource('/run/desktop/mnt/host/c/Users/example/project/file').toLowerCase(), resolve('C:/Users/example/project/file').toLowerCase());
  assert.notEqual(normalizeBindSource('../TRISSEA_Platform_m2_identity/file'), resolve('file'));
});
test('developer aliases and CI startup use only the canonical infrastructure workflow', async () => {
  const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['up', 'down', 'status', 'logs', 'check']) assert.equal(scripts['dev:infra:' + name], 'node scripts/dev-infra.mjs ' + name);
  assert.equal(scripts['infra:up'], 'pnpm dev:infra:up'); assert.equal(scripts['keycloak:up'], 'pnpm dev:infra:up');
  for (const file of ['m1', 'm2-identity']) assert.doesNotMatch(await readFile(new URL('../.github/workflows/' + file + '.yml', import.meta.url), 'utf8'), /compose\.m2|infra\/compose\.yml|down -v|system prune|volume prune/);
  const manager = await readFile(new URL('../scripts/dev-infra.mjs', import.meta.url), 'utf8'); assert.match(manager, /composeCommand\(\['stop'/); assert.doesNotMatch(manager, /\['down'|\['prune'/);
});
test('local bootstrap configuration never appears in the production example and secret placeholders are empty', async () => {
  const local = parseEnv(await readFile(new URL('../.env.local.example', import.meta.url), 'utf8')), prod = parseEnv(await readFile(new URL('../.env.production.example', import.meta.url), 'utf8'));
  assert.equal(local.DEV_POSTGRES_ADMIN_PASSWORD, ''); assert.equal(prod.DEV_POSTGRES_ADMIN_PASSWORD, undefined);
  assert.equal(prod.TRISSEA_PRODUCTION_ENABLED, 'false'); assert.equal(local.SMS_PROVIDER, 'mock'); assert.equal(local.SMS_LIVE_ENABLED, 'false');
});
test('fresh core initialization separates database owners/runtime grants and safely quotes private values', () => {
  const env = { DEV_POSTGRES_ADMIN_USER: 'bootstrap_role', M1_POSTGRES_USER: 'app_owner', M1_POSTGRES_DB: 'app_database', M1_POSTGRES_PASSWORD: "noncredential'quoted", KEYCLOAK_DB_OWNER_PASSWORD: 'noncredential-owner', KEYCLOAK_DB_PASSWORD: 'noncredential-runtime' };
  const sql = renderCoreInit(env);
  assert.ok(sql.includes("'noncredential''quoted'"));
  assert.match(sql, /CREATE DATABASE "app_database" OWNER "app_owner"/);
  assert.match(sql, /CREATE DATABASE keycloak_identity OWNER keycloak_owner/);
  assert.match(sql, /REVOKE ALL ON DATABASE keycloak_identity FROM PUBLIC/);
  assert.match(sql, /GRANT CONNECT,TEMPORARY ON DATABASE keycloak_identity TO keycloak_runtime/);
  assert.ok(sql.includes('\\connect "app_database"'));
  assert.throws(() => renderCoreInit({ ...env, M1_POSTGRES_USER: 'invalid;identifier' }));
  assert.throws(() => renderCoreInit({ ...env, DEV_POSTGRES_ADMIN_USER: 'app_owner' }));
});
