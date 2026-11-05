import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Controller, Get, Module, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { IdentityProvider, type Principal } from '../src/auth/identity-provider';
import { authorize } from '../src/auth/authorization';

const principal: Principal = { subject: 'synthetic-admin', mfa: true, grants: [{ cityId: 'city-a', todaId: 'toda-a', permissions: ['rides.read.masked'] }] };

@Controller('protected-example')
class ExampleController { @Get() read() { return { protected: true }; } }
@Module({ imports: [AppModule], controllers: [ExampleController] })
class TestModule {}

test('Fastify: health is public; new routes deny absent, malformed, invalid and failed-provider tokens', async () => {
  const module = await Test.createTestingModule({ imports: [TestModule] }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
  app.setGlobalPrefix('v1');
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  try {
    const health = await app.inject({ method: 'GET', url: '/v1/health' });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { status: 'ok', service: 'trissea-api', milestone: 'M1', bookingsEnabled: false });
    for (const authorization of ['', 'Basic invalid', 'Bearer invalid', 'Bearer token extra']) {
      assert.equal((await app.inject({ method: 'GET', url: '/v1/protected-example', headers: { authorization } })).statusCode, 401);
    }
    assert.equal((await app.inject({ method: 'POST', url: '/v1/rides' })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/quotes' })).statusCode, 404);
  } finally { await app.close(); }
});

test('guard accepts only provider-verified identity; provider failure is a generic 401', async () => {
  const module = await Test.createTestingModule({ imports: [TestModule] }).overrideProvider(IdentityProvider).useValue({
    verifyAccessToken(token: string) { if (token === 'throw') throw new UnauthorizedException(); return Promise.resolve(token === 'test-token' ? principal : null); },
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }), { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/protected-example', headers: { authorization: 'Bearer test-token' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/protected-example', headers: { authorization: 'Bearer throw' } })).statusCode, 401);
  } finally { await app.close(); }
});

test('authorization prevents wrong-city, cross-TODA, city-wide escalation, missing MFA and missing permission', () => {
  assert.doesNotThrow(() => authorize(principal, { cityId: 'city-a', todaId: 'toda-a' }, 'rides.read.masked'));
  for (const scope of [{ cityId: 'city-b', todaId: 'toda-a' }, { cityId: 'city-a', todaId: 'toda-b' }, { cityId: 'city-a' }]) {
    assert.throws(() => authorize(principal, scope, 'rides.read.masked'), ForbiddenException);
  }
  assert.throws(() => authorize({ ...principal, mfa: false }, { cityId: 'city-a', todaId: 'toda-a' }, 'rides.read.masked'), ForbiddenException);
  assert.throws(() => authorize(principal, { cityId: 'city-a', todaId: 'toda-a' }, 'gps.read.live'), ForbiddenException);
  assert.throws(() => authorize({ ...principal, grants: [] }, { cityId: 'city-a' }, 'config.manage'), ForbiddenException);
  const cityAdmin = { ...principal, grants: [{ cityId: 'city-a', permissions: ['config.manage'] }] };
  assert.doesNotThrow(() => authorize(cityAdmin, { cityId: 'city-a', todaId: 'toda-a' }, 'config.manage'));
});

