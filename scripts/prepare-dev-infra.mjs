import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import configuration from './environment.cjs';

export function renderCoreInit(env) {
  const identifier = value => { if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw new Error('Invalid local database identifier'); return '"' + value + '"'; };
  const literal = value => "'" + value.replaceAll("'", "''") + "'";
  const appUser = identifier(env.M1_POSTGRES_USER), appDb = identifier(env.M1_POSTGRES_DB);
  if ([env.M1_POSTGRES_USER, 'keycloak_owner', 'keycloak_runtime', 'm2_test_owner'].includes(env.DEV_POSTGRES_ADMIN_USER)) throw new Error('Bootstrap role must be separate');
  const sql = `CREATE ROLE ${appUser} LOGIN PASSWORD ${literal(env.M1_POSTGRES_PASSWORD)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE ${appDb} OWNER ${appUser};
REVOKE ALL ON DATABASE ${appDb} FROM PUBLIC;
GRANT CONNECT,TEMPORARY ON DATABASE ${appDb} TO ${appUser};
\\connect ${appDb}
CREATE EXTENSION IF NOT EXISTS postgis;
\\connect postgres
CREATE ROLE keycloak_owner LOGIN PASSWORD ${literal(env.KEYCLOAK_DB_OWNER_PASSWORD)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE keycloak_runtime LOGIN PASSWORD ${literal(env.KEYCLOAK_DB_PASSWORD)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE keycloak_identity OWNER keycloak_owner;
REVOKE ALL ON DATABASE keycloak_identity FROM PUBLIC;
GRANT CONNECT,TEMPORARY ON DATABASE keycloak_identity TO keycloak_runtime;
\\connect keycloak_identity
GRANT USAGE,CREATE ON SCHEMA public TO keycloak_runtime;
`;
  return sql;
}

export async function prepare() {
  for (const script of ['prepare-foundation-local.mjs', 'prepare-identity-test.mjs', 'prepare-keycloak-local.mjs']) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) throw new Error('Existing configuration requires review');
  }
  let env = configuration.loadLocal();
  if (!env.DEV_POSTGRES_ADMIN_PASSWORD) {
    const volumes = spawnSync('docker', ['volume', 'ls', '--filter', 'label=com.docker.compose.project=trissea-dev', '-q'], { encoding: 'utf8', windowsHide: true });
    if (volumes.status !== 0 || volumes.stdout.trim()) throw new Error('Do not generate credentials for retained volumes');
    configuration.updateLocal({ DEV_POSTGRES_ADMIN_USER: env.DEV_POSTGRES_ADMIN_USER, DEV_POSTGRES_ADMIN_PASSWORD: randomBytes(32).toString('base64url') });
    env = configuration.loadLocal();
  }
  const sql = renderCoreInit(env);
  const directory = new URL('../.cache/dev-infra/', import.meta.url);
  for (const name of ['init/', 'secrets/', 'realm-import/']) await mkdir(new URL(name, directory), { recursive: true });
  async function preserveOrWrite(path, contents) {
    const target = new URL(path, directory);
    try { if (!(await readFile(target)).equals(Buffer.from(contents))) throw new Error('Generated configuration differs; do not replace credentials'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(target, contents, { flag: 'wx', mode: 0o600 }); }
  }
  await preserveOrWrite('secrets/core-admin-password', env.DEV_POSTGRES_ADMIN_PASSWORD);
  await preserveOrWrite('secrets/test-owner-password', env.M2_TEST_POSTGRES_PASSWORD);
  await preserveOrWrite('realm-import/trissea-local-realm.json', await readFile(new URL('../.cache/m2-keycloak/realm-import/trissea-local-realm.json', import.meta.url)));
  await preserveOrWrite('init/core.sql', sql);
  console.info('Canonical development artifacts ready; existing credentials and keys preserved.');
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/prepare-dev-infra.mjs')) {
  await prepare().catch(() => { console.error('Development infrastructure preparation rejected; inspect safe configuration prerequisites.'); process.exitCode = 1; });
}
