import configuration from './environment.cjs';
try {
  configuration.loadLocal();
  if (!process.argv.includes('--compose')) for (const profile of configuration.profiles) configuration.environmentFor(profile);
  console.info('Canonical local configuration, profiles and isolation boundaries validated; no values printed.');
} catch { console.error('Environment validation failed; inspect the schema and configured profile prerequisites.'); process.exitCode = 1; }
