import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { generate, generateHealthClient, schemaType } from '../scripts/generate-contracts.mjs';
import { assertLocalDatabase } from '../scripts/migration-policy.mjs';

test('migration tools refuse remote/production databases', () => {
  assert.doesNotThrow(() => assertLocalDatabase('postgres://test:test@127.0.0.1:5432/test', 'development'));
  for (const [url, env] of [['postgres://test:test@remote.invalid/test', 'development'], ['postgres://test:test@localhost/test', 'production'], ['https://localhost/test', 'development']]) {
    assert.throws(() => assertLocalDatabase(url, env));
  }
  assert.throws(() => assertLocalDatabase('invalid-private-configuration', 'development'), { message: 'Invalid local database configuration' });
});

test('generated MVP contract remains reproducible; public health never enables bookings', async () => {
  const document = parse(await readFile(new URL('../contracts/openapi-mvp.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(document.paths['/health'].get.security, []);
  assert.equal(document.components.schemas.HealthResponse.properties.bookingsEnabled.const, false);
  const artifact = await readFile(new URL('../packages/contracts/src/generated/m1.ts', import.meta.url), 'utf8');
  assert.equal(generate(document), artifact);
  assert.equal(generateHealthClient(document), await readFile(new URL('../packages/contracts/src/health-client.ts', import.meta.url), 'utf8'));
  assert.throws(() => schemaType({ oneOf: [] }));
  assert.equal(schemaType({ type: 'array', items: { type: 'integer' } }), 'Array<number>');
});

test('actual light and dark text/action/notice color pairs meet WCAG AA', async () => {
  const { colors } = JSON.parse(await readFile(new URL('../design/tokens.json', import.meta.url), 'utf8'));
  function luminance(hex) {
    const rgb = hex.match(/[0-9a-f]{2}/ig).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  for (const [foreground, background] of [
    [colors.text.primary, colors.surface.base], [colors.text.secondary, colors.surface.paper],
    [colors.text.secondary, colors.surface.base], [colors.surface.paper, colors.brand.teal],
    [colors.brand.navy, colors.brand.amber], [colors.surface.base, colors.brand.navy],
  ]) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${foreground} on ${background}`);
  }
});
