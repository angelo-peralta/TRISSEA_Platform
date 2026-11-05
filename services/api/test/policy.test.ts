import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAuthorized } from '../src/auth/authorization-policy';
import type { Principal } from '../src/auth/identity-provider';

const actor: Principal = { subject: 'synthetic', mfa: true, grants: [{ cityId: 'city-a', todaId: 'toda-a', permissions: ['rides.read.masked'] }] };

test('TODA access matches city, organization and permission together', () => {
  assert.equal(isAuthorized(actor, { cityId: 'city-a', todaId: 'toda-a' }, 'rides.read.masked'), true);
  assert.equal(isAuthorized(actor, { cityId: 'city-b', todaId: 'toda-a' }, 'rides.read.masked'), false);
  assert.equal(isAuthorized(actor, { cityId: 'city-a', todaId: 'toda-b' }, 'rides.read.masked'), false);
  assert.equal(isAuthorized(actor, { cityId: 'city-a' }, 'rides.read.masked'), false);
  assert.equal(isAuthorized(actor, { cityId: 'city-a', todaId: 'toda-a' }, 'gps.read.live'), false);
});

test('scope and permissions cannot be combined from different grants', () => {
  const mixed: Principal = { ...actor, grants: [...actor.grants, { cityId: 'city-b', todaId: 'toda-b', permissions: ['config.manage'] }] };
  assert.equal(isAuthorized(mixed, { cityId: 'city-a', todaId: 'toda-a' }, 'config.manage'), false);
  assert.equal(isAuthorized(mixed, { cityId: 'city-b', todaId: 'toda-a' }, 'config.manage'), false);
});

test('admin MFA and explicit grants are mandatory, including for city scope', () => {
  const scope = { cityId: 'city-a', todaId: 'toda-a' };
  assert.equal(isAuthorized({ ...actor, mfa: false }, scope, 'rides.read.masked'), false);
  assert.equal(isAuthorized({ ...actor, grants: [] }, scope, 'rides.read.masked'), false);
  const city: Principal = { ...actor, grants: [{ cityId: 'city-a', permissions: ['config.manage'] }] };
  assert.equal(isAuthorized(city, scope, 'config.manage'), true);
  assert.equal(isAuthorized(city, { cityId: 'city-b' }, 'config.manage'), false);
});
