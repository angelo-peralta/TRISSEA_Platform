import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import configuration from '../scripts/environment.cjs';
import schema from '../scripts/environment-schema.cjs';

const file = new URL('../.env.local.example', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const options = environment => ({ file, environment: { NODE_ENV: 'development', ...environment } });
const database = (user, port, name) => `postgresql://${user}@127.0.0.1:${port}/${name}`;

test('canonical schema and examples match exactly; sensitive placeholders are empty', async () => {
  const local = parseEnv(await readFile(file, 'utf8'));
  assert.deepEqual(Object.keys(local).sort(), Object.keys(schema.fields).sort());
  for (const [key, [value]] of Object.entries(schema.fields)) assert.equal(local[key], value, key);
  for (const [key, value] of Object.entries(local)) if (/_PASSWORD$|_SECRET$|_TOKEN$/.test(key)) assert.equal(value, '', key);
  const result = spawnSync(process.execPath, ['scripts/generate-environment-examples.mjs', '--check'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
});

test('injected configuration wins; old dotenv files are not consulted', () => {
  const env = configuration.loadLocal(options({ ADMIN_ORIGIN: 'http://127.0.0.1:5999' }));
  assert.equal(env.ADMIN_ORIGIN, 'http://127.0.0.1:5999');
  assert.equal(env.M1_DATABASE_URL, '');
  assert.throws(() => configuration.loadLocal({ file: 'a-missing-config.fixture', environment: { NODE_ENV: 'production' } }), /prohibited/);
});

test('production injection never inherits development configuration and activation stays closed', () => {
  const env = configuration.loadProduction({ environment: { NODE_ENV: 'production', SMS_PROVIDER: 'philsms' } });
  assert.equal(env.KEYCLOAK_BOOTSTRAP_PASSWORD, undefined);
  assert.equal(env.M1_DATABASE_URL, undefined);
  assert.throws(() => configuration.loadProduction({ environment: { NODE_ENV: 'production', SMS_PROVIDER: 'mock' } }), /SMS_PROVIDER/);
  assert.throws(() => configuration.loadProduction({ file, environment: { NODE_ENV: 'production' } }), /production file/);
  for (const flag of configuration.closedFlags) assert.throws(() => configuration.loadProduction({ environment: { NODE_ENV: 'production', [flag]: 'true' } }), new RegExp(flag));
});

test('local live capabilities and weakened identity policy fail closed', () => {
  for (const flag of configuration.closedFlags) assert.throws(() => configuration.loadLocal(options({ [flag]: 'true' })), new RegExp(flag));
  for (const [key, value] of [['SMS_PROVIDER', 'philsms'], ['OTP_DIGITS', '5'], ['OTP_MAX_ATTEMPTS', '6'], ['OTP_RESEND_SECONDS', '59'], ['MOBILE_JWT_SECONDS', '601'], ['ADMIN_IDLE_SECONDS', '901'], ['OTP_HOURLY_LIMIT', '6'], ['M1_API_PORT', '0']]) assert.throws(() => configuration.loadLocal(options({ [key]: value })), new RegExp(key));
});

test('foundation/test profiles preserve cluster isolation and explicit disposable opt-in', () => {
  const injected = { M1_DATABASE_URL: database('foundation',15432,'foundation'), M2_TEST_CONTROL_URL: database('control',15433,'m2_control') };
  const foundation = configuration.environmentFor('foundation', options(injected));
  assert.equal(foundation.DATABASE_URL, injected.M1_DATABASE_URL);
  assert.equal(foundation.M2_DISPOSABLE_DATABASE, 'false');
  assert.equal(foundation.M2_ADMIN_AUTH_ENABLED, 'false');
  const isolated = configuration.environmentFor('test', options(injected));
  assert.equal(isolated.M2_DISPOSABLE_DATABASE, 'true');
  assert.equal(isolated.NODE_ENV, 'development');
  assert.throws(() => configuration.loadLocal(options({ ...injected, M1_DATABASE_URL: database('foundation',15433,'foundation') })), /isolation/);
  assert.throws(() => configuration.environmentFor('test', options({ ...injected, M2_TEST_DISPOSABLE_DATABASE: 'false' })), /disposable/);
});

test('mobile fixture profiles retain separate database roles, keys, ports and client purposes', () => {
  const injected = { PASSENGER_LOCAL_AUTH_ENABLED: 'true', DRIVER_LOCAL_AUTH_ENABLED: 'true', PASSENGER_LOCAL_DATABASE_URL: database('passenger',15433,'trissea_m2_test_aaaaaaaaaaaa'), DRIVER_LOCAL_DATABASE_URL: database('driver',15433,'trissea_m2_test_bbbbbbbbbbbb'), PASSENGER_LOCAL_KEYS_FILE: 'passenger.fixture', DRIVER_LOCAL_KEYS_FILE: 'driver.fixture' };
  const passenger = configuration.environmentFor('passenger', options(injected)), driver = configuration.environmentFor('driver', options(injected));
  assert.equal(passenger.M2_DRIVER_AUTH_ENABLED, 'false'); assert.equal(driver.M2_DRIVER_AUTH_ENABLED, 'true');
  assert.notEqual(passenger.M2_PASSENGER_DATABASE_URL, driver.M2_PASSENGER_DATABASE_URL);
  assert.notEqual(passenger.M2_PASSENGER_KEYS_FILE, driver.M2_PASSENGER_KEYS_FILE);
  assert.equal(passenger.API_PORT, '4100'); assert.equal(driver.API_PORT, '4101');
  assert.throws(() => configuration.loadLocal(options({ ...injected, DRIVER_LOCAL_DATABASE_URL: injected.PASSENGER_LOCAL_DATABASE_URL })), /role separation/);
});

test('first-party startup and CI contain no retired dotenv loaders or generators', async () => {
  const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const value of Object.values(scripts)) assert.doesNotMatch(value, /\.env\.m[12]|\.env\.example|--env-file=\.env(?:\s|$)/);
  for (const name of ['m1','m2-identity']) assert.doesNotMatch(await readFile(new URL('../.github/workflows/'+name+'.yml', import.meta.url), 'utf8'), /\.env\.m[12]|\.env\.example|--env-file \.env(?:\s|$)/);
});
