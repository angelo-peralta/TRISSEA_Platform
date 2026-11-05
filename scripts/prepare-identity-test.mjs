import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const password = randomBytes(32).toString('hex');
const contents = `NODE_ENV=development\nM2_DISPOSABLE_DATABASE=true\nM2_TEST_POSTGRES_PASSWORD=${password}\nM2_TEST_POSTGRES_PORT=15433\nM2_TEST_CONTROL_URL=postgres://m2_test_owner:${password}@127.0.0.1:15433/m2_control\n`;
try {
  await writeFile(new URL('../.env.m2-test',import.meta.url),contents,{flag:'wx',mode:0o600});
  console.info('Generated ignored credentials for the isolated M2 test cluster.');
} catch(error) {
  if (error.code !== 'EEXIST') throw new Error('Unable to prepare isolated identity test environment');
  console.info('Existing local M2 test environment preserved.');
}
