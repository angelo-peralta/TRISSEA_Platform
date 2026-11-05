import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { assertLocalDatabase } from './migration-policy.mjs';

const command = process.argv[2];
if (!['up', 'down', 'status'].includes(command)) throw new Error('Usage: migrate.mjs up|down|status');
assertLocalDatabase(process.env.DATABASE_URL, process.env.NODE_ENV);
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {}, connection: { timezone: 'UTC' }, connect_timeout: 5 });
const directory = new URL('../database/migrations/', import.meta.url);
try {
  const files = (await readdir(directory)).filter(name => /^\d{4}_.+\.up\.sql$/.test(name)).sort();
  const migrations = await Promise.all(files.map(async file => {
    const id = file.replace('.up.sql', '');
    const up = await readFile(new URL(file, directory), 'utf8');
    const down = await readFile(new URL(`${id}.down.sql`, directory), 'utf8');
    return { id, up, down, checksum: createHash('sha256').update(up).update('\0').update(down).digest('hex') };
  }));
  await sql.begin(async transaction => {
    await transaction`SELECT pg_advisory_xact_lock(71501001)`;
    await transaction`CREATE TABLE IF NOT EXISTS trissea_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const applied = await transaction`SELECT id, checksum FROM trissea_migrations ORDER BY id`;
    for (const [index, row] of applied.entries()) {
      const migration = migrations[index];
      if (!migration || migration.id !== row.id || migration.checksum !== row.checksum) throw new Error('Migration history mismatch');
    }
    if (command === 'status') {
      for (const migration of migrations) console.info(`${migration.id}: ${applied.some(row => row.id === migration.id) ? 'applied' : 'pending'}`);
    } else if (command === 'down') {
      const last = applied.at(-1);
      if (!last) { console.info('No applied migrations.'); return; }
      const migration = migrations.find(item => item.id === last.id);
      await transaction.unsafe(migration.down);
      await transaction`DELETE FROM trissea_migrations WHERE id = ${last.id}`;
      console.info(`Rolled back ${last.id}`);
    } else {
      for (const migration of migrations.slice(applied.length)) {
        await transaction.unsafe(migration.up);
        await transaction`INSERT INTO trissea_migrations(id, checksum) VALUES (${migration.id}, ${migration.checksum})`;
        console.info(`Applied ${migration.id}`);
      }
    }
  });
} catch {
  // Driver errors may include connection strings or SQL parameters. Keep output generic.
  console.error('Migration failed; check local database availability and migration history.');
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
