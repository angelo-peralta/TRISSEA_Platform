import { readFile, writeFile } from 'node:fs/promises';
import schema from './environment-schema.cjs';

export function renderExample(production = false) {
  const heading = production
    ? '# PRODUCTION CONTRACT ONLY. No release or credentials provisioned.\n# Use approved secret injection; this file never inherits local settings.'
    : '# DEVELOPMENT ONLY. Copy to .env.local, then run the relevant prepare commands.\n# Blank secrets are intentionally unusable. Existing credentials must be preserved.';
  return heading + '\n# Generated from scripts/environment-schema.cjs; update the schema and templates together.\n\n' +
    Object.entries(schema.fields).filter(([key]) => !production ||
      !(/^(DEV_|M1_|M2_TEST_|PASSENGER_LOCAL_|DRIVER_LOCAL_)/.test(key) || key === 'ADMIN_LOCAL_AUTH_ENABLED' || key.endsWith('_METRO_PORT')))
      .map(([key, [initial, comment]]) => {
        let value = initial;
        if (production) {
          if (key === 'NODE_ENV') value = 'production';
          if (key === 'SMS_PROVIDER') value = 'philsms';
          if (key === 'ADMIN_SECURITY_MODE') value = 'production';
          if (key === 'ADMIN_ORIGIN') value = 'https://admin.example.invalid';
          if (key === 'KEYCLOAK_ISSUER') value = 'https://identity.example.invalid/realms/trissea';
          if (['ADMIN_KEYS_FILE', 'ADMIN_API_PROXY_TARGET', 'M2_AUTH_MODE'].includes(key)) value = '';
        }
        return '# ' + comment + '\n' + key + '=' + value + '\n';
      }).join('\n');
}

for (const [filename, production] of [['.env.local.example', false], ['.env.production.example', true]]) {
  const target = new URL('../' + filename, import.meta.url), content = renderExample(production);
  if (process.argv.includes('--check')) {
    if ((await readFile(target, 'utf8')).replace(/\r\n/g, '\n') !== content) throw new Error('Environment example drift: ' + filename);
  } else await writeFile(target, content);
}
