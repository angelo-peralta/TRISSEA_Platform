import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {test} from 'node:test';
test('native identity dependencies match the installed Expo SDK bundle and backup plugin is configured',async()=>{
 for(const app of ['passenger','driver']){
  const pkg=JSON.parse(await readFile(new URL('../apps/'+app+'/package.json',import.meta.url),'utf8')),config=JSON.parse(await readFile(new URL('../apps/'+app+'/app.json',import.meta.url),'utf8')),bundle=JSON.parse(await readFile(new URL('../apps/'+app+'/node_modules/expo/bundledNativeModules.json',import.meta.url),'utf8'));
  for(const module of ['expo-secure-store','expo-crypto'])assert.equal(pkg.dependencies[module],bundle[module].replace(/^~/,''));
  assert.deepEqual(config.expo.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-secure-store'),['expo-secure-store',{configureAndroidBackup:true}]);
 }
});
test('only two public identity keys enter Expo; local and production templates keep preview disabled',async()=>{
 const source=await readFile(new URL('../packages/mobile-auth/src/AuthScreen.tsx',import.meta.url),'utf8'),used=[...source.matchAll(/process\.env\.(\w+)/g)].map(m=>m[1]).sort();assert.deepEqual(used,['EXPO_PUBLIC_M2_API_URL','EXPO_PUBLIC_M2_AUTH_ENABLED']);
 for(const file of ['.env.local.example','.env.production.example']){const e=parseEnv(await readFile(new URL('../'+file,import.meta.url),'utf8'));assert.equal(e.EXPO_PUBLIC_M2_AUTH_ENABLED,'false');assert.equal(e.EXPO_PUBLIC_M2_API_URL,'');}
});
