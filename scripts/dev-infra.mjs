import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import postgres from 'postgres';
import configuration from './environment.cjs';

export const project = 'trissea-dev';
export const services = ['postgres', 'postgres-test', 'redis', 'keycloak'];
const root = configuration.root, compose = resolve(root, 'infra/compose.dev.yml');
const req = createRequire(new URL('../services/api/package.json', import.meta.url));
const { createClient } = req('@redis/client');

export function normalizeBindSource(source) {
  // Docker Desktop may report the same Windows bind using either spelling.
  const desktop = /^\/run\/desktop\/mnt\/host\/([a-z])\/(.*)$/i.exec(source);
  return process.platform === 'win32' && desktop ? resolve(desktop[1] + ':/' + desktop[2]) : resolve(source);
}

export function command(binary, args, { env = process.env, input, maxBytes = 64 * 1024 * 1024 } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(binary, args, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const out = [], errors = []; let size = 0;
    child.stdout.on('data', bytes => { size += bytes.length; if (size > maxBytes) child.kill(); else out.push(bytes); });
    // Database/Docker errors can contain SQL credentials. Callers report stages,
    // exit codes and sanitized invariants, never the raw stderr stream.
    child.stderr.on('data', bytes => { if (errors.reduce((n, b) => n + b.length, 0) < 1024 * 1024) errors.push(bytes); });
    child.on('error', () => reject(new Error('Local tool unavailable')));
    child.on('close', code => {
      if (code === 0 && size <= maxBytes) accept(Buffer.concat(out));
      else {
        const error = new Error('Local command failed; private details withheld'); error.exitCode = code;
        Object.defineProperty(error, 'privateStderr', { value: Buffer.concat(errors), enumerable: false });
        reject(error);
      }
    });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
export function composeCommand(args, overrides = {}) {
  const env = { ...configuration.loadLocal(), ...overrides };
  return command('docker', ['compose', '--project-name', project, '--env-file', '.env.local', '-f', compose, ...args], { env });
}
export async function containers() {
  const raw = (await command('docker', ['ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project])).toString().trim();
  if (!raw) return [];
  const result = JSON.parse((await command('docker', ['inspect', ...raw.split(/\r?\n/)])).toString());
  for (const c of result) {
    const labels = c.Config.Labels;
    if (labels?.['com.docker.compose.project'] !== project || !services.includes(labels['com.docker.compose.service'])) throw new Error('Unexpected project ownership');
    const origin = labels['com.docker.compose.project.config_files']?.replaceAll('\\', '/');
    if (origin?.toLowerCase() !== compose.replaceAll('\\', '/').toLowerCase()) throw new Error('Project config ownership mismatch');
  }
  return result;
}
export async function safeStatus() {
  return (await containers()).map(c => ({ id: c.Id, service: c.Config.Labels['com.docker.compose.service'], name: c.Name.slice(1), state: c.State.Status,
    health: c.State.Health?.Status ?? 'none', ports: c.NetworkSettings.Ports,
    mounts: c.Mounts.map(m => ({ type: m.Type, volume: m.Name, source: m.Source, destination: m.Destination })) }));
}
export async function check({ allowLegacy = false } = {}) {
  const env = configuration.loadLocal(), current = await containers();
  if (current.length !== services.length || services.some(s => !current.some(c => c.Config.Labels['com.docker.compose.service'] === s && c.State.Running && c.State.Health?.Status === 'healthy'))) throw new Error('Canonical services not healthy');
  for (const c of current) for (const mount of c.Mounts.filter(m => m.Type === 'bind')) {
    const rel = relative(root, normalizeBindSource(mount.Source));
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) throw new Error('External worktree bind dependency');
  }
  const allIds = (await command('docker', ['ps', '-aq', '--filter', 'label=com.docker.compose.project'])).toString().trim();
  const all = allIds ? JSON.parse((await command('docker', ['inspect', ...allIds.split(/\r?\n/)])).toString()) : [];
  const legacy = all.filter(c => c.Config.Labels['com.docker.compose.project'].startsWith('trissea-') && c.Config.Labels['com.docker.compose.project'] !== project);
  if (legacy.length && !allowLegacy) throw new Error('Legacy development containers remain');
  const options = { max: 1, connect_timeout: 5, onnotice: () => {} }, core = postgres(env.M1_DATABASE_URL, options), test = postgres(env.M2_TEST_CONTROL_URL, options);
  const keycloakUrl = new URL(env.M1_DATABASE_URL); keycloakUrl.username = 'keycloak_runtime'; keycloakUrl.password = env.KEYCLOAK_DB_PASSWORD; keycloakUrl.pathname = '/keycloak_identity';
  const idp = postgres(keycloakUrl.href, options), redis = createClient({ url: 'redis://127.0.0.1:' + env.DEV_REDIS_PORT, socket: { connectTimeout: 5000, reconnectStrategy: false } }); redis.on('error', () => {});
  try {
    const [appRole] = await core`SELECT rolsuper,rolbypassrls,rolreplication,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`;
    const [idpRole] = await idp`SELECT rolsuper,rolbypassrls,rolreplication,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`;
    if (Object.values(appRole).some(Boolean) || Object.values(idpRole).some(Boolean)) throw new Error('Unsafe core runtime role');
    const [isolation] = await core`SELECT has_database_privilege(current_user,'keycloak_identity','CONNECT') AS idp_access,(SELECT count(*)::int FROM pg_roles WHERE rolname='m2_test_owner') AS test_roles`;
    const [reverse] = await idp`SELECT has_database_privilege(current_user,${new URL(env.M1_DATABASE_URL).pathname.slice(1)},'CONNECT') AS app_access`;
    const [testRoles] = await test`SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('keycloak_owner','keycloak_runtime',${env.M1_POSTGRES_USER})`;
    if (isolation.idp_access || isolation.test_roles || reverse.app_access || testRoles.n) throw new Error('Database isolation failed');
    await core`SELECT postgis_version()`; await test`SELECT 1`;
    await redis.connect(); if (await redis.ping() !== 'PONG') throw new Error('Redis unavailable');
    const discovery = await fetch(env.KEYCLOAK_ISSUER + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(10000) });
    if (!discovery.ok || (await discovery.json()).issuer !== env.KEYCLOAK_ISSUER) throw new Error('Keycloak issuer mismatch');
    return { project, services: services.length, healthy: true, postgis: true, redis: 'PONG', coreRuntimeSuperusers: false, applicationIdpDatabaseAccessSeparated: true, testClusterSeparated: true, issuerPreserved: true, siblingBindDependencies: false, legacyRetirementPending: legacy.length > 0 };
  } finally { await Promise.allSettled([core.end(), test.end(), idp.end(), redis.isOpen ? redis.quit() : Promise.resolve()]); }
}
export function sanitizeLogs(raw) {
  const events = [], counters = { omitted: 0 };
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    const service = [...services].sort((a, b) => b.length - a.length).find(s => line.startsWith(s + '-')) ?? 'service';
    const event = /permission denied/i.test(line) ? 'private_artifact_permission_denied' : /ready to accept connections/i.test(line) ? (service === 'redis' ? 'redis_ready' : 'database_ready') : /database system is shut down/i.test(line) ? 'database_stopped' : /Keycloak .* started/i.test(line) ? 'identity_started' : null;
    if (event) events.push({ service, event }); else counters.omitted++;
  }
  return { events, suppressedUnrecognizedLines: counters.omitted, rawAuthenticationOrSqlLogsExposed: false };
}
async function main() {
  const action = process.argv[2];
  if (action === 'up') {
    const env = configuration.loadLocal();
    if (env.DEV_RESTORE_MODE !== 'false') throw new Error('Ordinary startup cannot bypass fresh initialization');
    if (!env.DEV_POSTGRES_ADMIN_PASSWORD) throw new Error('Explicit infrastructure preparation required');
    for (const path of ['secrets/core-admin-password', 'secrets/test-owner-password', 'init/core.sql', 'realm-import/trissea-local-realm.json']) await access(resolve(root, '.cache/dev-infra', path));
    await containers();
    await composeCommand(['up', '-d', '--wait', '--wait-timeout', '240']);
    console.info('Canonical development services started; existing volumes and credentials preserved.');
  } else if (action === 'down') { await containers(); await composeCommand(['stop', '--timeout', '30']); console.info('Canonical containers stopped; all volumes retained.'); }
  else if (action === 'status') console.info(JSON.stringify(await safeStatus(), null, 2));
  else if (action === 'check') console.info(JSON.stringify(await check({ allowLegacy: process.argv.includes('--allow-legacy') }), null, 2));
  else if (action === 'logs') { await containers(); console.info(JSON.stringify(sanitizeLogs((await composeCommand(['logs', '--no-color', '--tail', '100'])).toString()), null, 2)); }
  else if (action === 'config') { await composeCommand(['config', '--quiet']); console.info('Canonical Compose configuration validated; no credentials printed.'); }
  else throw new Error('Expected up|down|status|check|logs|config');
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await main().catch(() => { console.error('Development infrastructure operation failed; inspect safe prerequisites/status. Raw details withheld.'); process.exitCode = 1; });
}
