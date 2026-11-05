import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHealthClient } from '../src/health-client';

const health = { status: 'ok', service: 'trissea-api', milestone: 'M1', bookingsEnabled: false };

test('typed health client uses the versioned URL and caller cancellation signal', async () => {
  const controller = new AbortController();
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(input, 'http://localhost:4000/v1/health');
    assert.equal(init?.signal, controller.signal);
    return new Response(JSON.stringify(health));
  };
  assert.deepEqual(await createHealthClient('http://localhost:4000/v1/', fetcher).getHealth(controller.signal), health);
});

test('client rejects HTTP failure, malformed health and a false booking-availability claim', async () => {
  for (const response of [new Response(null, { status: 503 }), new Response('{}'), new Response(JSON.stringify({ ...health, bookingsEnabled: true }))]) {
    await assert.rejects(createHealthClient('/v1', async () => response).getHealth());
  }
  await assert.rejects(createHealthClient('/v1', async () => { throw new Error('Network unavailable'); }).getHealth());
});
