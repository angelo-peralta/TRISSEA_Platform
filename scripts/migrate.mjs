import postgres from 'postgres';
import { assertLocalDatabase, assertDisposableIdentityDatabase } from './migration-policy.mjs';
import { runMigrations } from './migration-runner.mjs';

const command = process.argv[2];
if (!['up', 'down', 'status'].includes(command)) throw new Error('Usage: migrate.mjs up|down|status');
assertLocalDatabase(process.env.DATABASE_URL, process.env.NODE_ENV);
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {}, connection: { timezone: 'UTC' }, connect_timeout: 5 });
const allowIdentity = process.env.M2_DISPOSABLE_DATABASE === 'true';
if (allowIdentity) assertDisposableIdentityDatabase(process.env.DATABASE_URL, process.env.NODE_ENV, process.env.M2_DISPOSABLE_DATABASE);
try {
  if (allowIdentity) {
    const [marker] = await sql`SELECT value FROM m2_disposable_manifest WHERE key='identity-test'`;
    if (marker?.value !== new URL(process.env.DATABASE_URL).pathname.slice(1)) throw new Error('Disposable marker mismatch');
  }
  // Existing M1 commands stay safe on existing local databases. Identity DDL is explicit opt-in only.
  const through = process.env.MIGRATION_TARGET ?? (allowIdentity ? undefined : '0001_foundation');
  await runMigrations(sql, command, { through, allowIdentity });
} catch {
  // Driver errors may include connection strings or SQL parameters. Keep output generic.
  console.error('Migration failed; check local database availability and migration history.');
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
