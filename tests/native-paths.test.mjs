import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

test('Windows native codegen paths fit the Ninja filename limit', { skip: process.platform !== 'win32' }, () => {
  for (const app of ['passenger', 'driver']) {
    const appRequire = createRequire(new URL(`../apps/${app}/package.json`, import.meta.url));
    for (const name of ['react-native-reanimated', 'react-native-safe-area-context', 'react-native-screens']) {
      const manifest = appRequire.resolve(`${name}/package.json`);
      const library = appRequire(manifest).codegenConfig.name;
      const source = join(dirname(manifest), 'android/build/generated/source/codegen/jni/react/renderer/components', library, 'ComponentDescriptors.cpp');
      assert.ok(source.length < 260, `${app}: ${name} native filename is ${source.length} characters; keep the checkout short and use the configured short pnpm layout`);
    }
  }
});
