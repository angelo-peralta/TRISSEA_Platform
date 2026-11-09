import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testDatabasePort, otpRedisPort, localKeycloakPort } from '../src/development-endpoints';

test('local endpoint defaults preserve existing database, OTP and OIDC boundaries', () => {
  const env = { NODE_ENV: 'test' };
  assert.equal(testDatabasePort(env), '15433'); assert.equal(otpRedisPort(env), '16380'); assert.equal(localKeycloakPort(env), '18080');
});
test('explicit staged endpoints allow validation without stopping legacy tmpfs data', () => {
  const env = { NODE_ENV: 'test', M2_TEST_POSTGRES_PORT: '16433', DEV_REDIS_PORT: '17380', DEV_KEYCLOAK_PORT: '18081' };
  assert.equal(testDatabasePort(env), '16433'); assert.equal(otpRedisPort(env), '17380'); assert.equal(localKeycloakPort(env), '18081');
});
test('arbitrary ports and production use cannot weaken local endpoint restrictions', () => {
  assert.throws(() => testDatabasePort({ NODE_ENV: 'test', M2_TEST_POSTGRES_PORT: '15432' }));
  assert.throws(() => otpRedisPort({ NODE_ENV: 'test', DEV_REDIS_PORT: '6379' }));
  assert.throws(() => localKeycloakPort({ NODE_ENV: 'test', DEV_KEYCLOAK_PORT: '443' }));
  for (const resolve of [testDatabasePort, otpRedisPort, localKeycloakPort]) assert.throws(() => resolve({ NODE_ENV: 'production' }));
});
