import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

// Exercise real consumers of the reviewed security overrides, not substitute mocks.
const appRequire = createRequire(new URL('../apps/passenger/package.json', import.meta.url));
const routerRequire = createRequire(appRequire.resolve('expo-router/package.json'));
const expoRequire = createRequire(appRequire.resolve('expo/package.json'));
const cliPackage = expoRequire.resolve('@expo/cli/package.json');
const cliRequire = createRequire(cliPackage);

test('Router query parsing and serialization work with the patched ESM decoder', () => {
  const query = routerRequire('query-string');
  assert.equal(query.parse('destination=City%20Hall&label=%E2%82%B1').destination, 'City Hall');
  assert.equal(query.parse('label=%E2%82%B1').label, '₱');
  assert.deepEqual([...query.parse('seat=1&seat=2').seat], ['1', '2']);
  assert.equal(query.stringify({ destination: 'City Hall' }), 'destination=City%20Hall');
  assert.doesNotThrow(() => query.parse(`label=${'%'.repeat(10_000)}`));
});

test('Expo CLI plugin schemas retain valid and invalid input behavior with patched Zod', () => {
  const { PluginSchema, DevToolsPluginOutputSchema } = cliRequire(join(dirname(cliPackage), 'build/src/start/server/DevToolsPlugin.schema.js'));
  const plugin = { packageName: 'synthetic-plugin', packageRoot: '/synthetic', cliExtensions: { description: 'Test', commands: [{ name: 'inspect', title: 'Inspect', environments: ['cli'], parameters: [{ name: 'enabled', type: 'confirm' }] }], entryPoint: './test.js' } };
  assert.equal(PluginSchema.parse(plugin).packageName, plugin.packageName);
  assert.equal(PluginSchema.safeParse({ ...plugin, packageName: '' }).success, false);
  assert.equal(DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 'Synthetic result', level: 'info' }]).success, true);
  assert.equal(DevToolsPluginOutputSchema.safeParse([{ type: 'image', url: 'invalid' }]).success, false);
});

test('Expo glob consumers retain the filesystem matching API after security upgrades', () => {
  const { globSync } = cliRequire('glob');
  const { minimatch } = createRequire(cliRequire.resolve('glob'))('minimatch');
  assert.ok(globSync('app/**/*.tsx', { cwd: new URL('../apps/passenger/', import.meta.url) }).length >= 4);
  assert.equal(minimatch('app/index.tsx', '**/*.tsx'), true);
  assert.equal(minimatch('app/index.ts', '**/*.tsx'), false);
});
