import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {test} from 'node:test';
test('verification feature and database keys are documented in safe local and production templates',async()=>{
 for(const name of ['.env.example','.env.production.example']){const env=parseEnv(await readFile(new URL('../'+name,import.meta.url),'utf8'));assert.equal(env.M2_VERIFICATION_ENABLED,'false');assert.equal(env.M2_VERIFICATION_DATABASE_URL,'');}
});
