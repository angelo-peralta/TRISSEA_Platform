import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { updateGradle } = createRequire(import.meta.url)('../plugins/with-android-short-paths.cjs');
const original = '// Existing customization\nallprojects { repositories { google() } }\napply plugin: "expo-root-project"\napply plugin: "com.facebook.react.rootproject"\n';

test('native path callbacks precede eager root plugins and regeneration is idempotent', () => {
  const result = updateGradle(original, 'p');
  assert.ok(result.indexOf('TRISSEA native staging begin') < result.indexOf('apply plugin:'));
  assert.ok(result.includes('// Existing customization'));
  assert.ok(result.includes('allprojects { repositories { google() } }'));
  assert.equal(updateGradle(result, 'p'), result);
});

test('passenger and driver native outputs are separated; unknown staging context fails', () => {
  assert.ok(updateGradle(original, 'p').includes('../../../.c/p/a'));
  assert.ok(updateGradle(original, 'd').includes('../../../.c/d/a'));
  assert.throws(() => updateGradle(original, '../outside'));
  assert.throws(() => updateGradle('unknown project format', 'p'));
});
