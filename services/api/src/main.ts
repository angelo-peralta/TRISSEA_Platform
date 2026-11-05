import { createApp } from './bootstrap';

async function main() {
  const port = Number(process.env.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API port');
  const app = await createApp();
  await app.listen(port, '127.0.0.1');
  console.info(`TRISSEA M1 API listening on loopback port ${port}`);
}
void main().catch(() => {
  console.error('API startup failed. Check local configuration.');
  process.exitCode = 1;
});
