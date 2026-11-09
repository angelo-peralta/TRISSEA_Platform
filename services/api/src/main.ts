import { resolve } from 'node:path';
import { createRequire } from 'node:module';

async function main() {
  const configuration = createRequire(__filename)(resolve(__dirname, '../../../scripts/environment.cjs')) as {
    environmentFor(profile: string): NodeJS.ProcessEnv;
    loadProduction(options: { file?: string }): NodeJS.ProcessEnv;
  };
  if (process.argv.includes('--production-file') && process.env.NODE_ENV !== 'production') throw new Error('Explicit production mode is required');
  if (process.env.NODE_ENV === 'production') {
    configuration.loadProduction(process.argv.includes('--production-file') ? { file: resolve(__dirname, '../../../.env.production') } : {});
    throw new Error('Production activation requires separate release approval');
  }
  Object.assign(process.env, configuration.environmentFor(process.env.TRISSEA_CONFIG_PROFILE ?? 'foundation'));
  const { createApp } = await import('./bootstrap');
  const port = Number(process.env.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API port');
  const app = await createApp();
  await app.listen(port, '127.0.0.1');
  console.info(`TRISSEA local API listening on loopback port ${port}`);
}
void main().catch(() => {
  console.error('API startup failed. Check local configuration.');
  process.exitCode = 1;
});
