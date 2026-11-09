import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

/** Shared transactional runner; caller must validate the target BEFORE connecting. */
export async function runMigrations(sql, command, { through, allowIdentity = false, report = console.info } = {}) {
  if (!['up', 'down', 'status'].includes(command)) throw new Error('Invalid migration command');
  const directory = new URL('../database/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d{4}_.+\.up\.sql$/.test(name)).sort();
  const migrations = await Promise.all(files.map(async file => {
    const id = file.replace('.up.sql', '');
    const up = await readFile(new URL(file, directory), 'utf8');
    const down = await readFile(new URL(`${id}.down.sql`, directory), 'utf8');
    return { id, up, down, checksum: createHash('sha256').update(up).update('\0').update(down).digest('hex') };
  }));
  if (through && !migrations.some(m => m.id === through)) throw new Error('Unknown migration target');
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(71501001)`;
    await tx`CREATE TABLE IF NOT EXISTS trissea_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const applied = await tx`SELECT id, checksum FROM trissea_migrations ORDER BY id`;
    for (const [index, row] of applied.entries()) {
      const migration = migrations[index];
      if (!migration || migration.id !== row.id || migration.checksum !== row.checksum) throw new Error('Migration history mismatch');
    }
    const desired = migrations.filter(m => !through || m.id <= through);
    const pending = desired.slice(applied.length);
    const last = applied.at(-1);
    const touched = command === 'up' ? pending : command === 'down' && last ? migrations.filter(m => m.id === last.id) : [];
    if (!allowIdentity && touched.some(m => m.id !== '0001_foundation')) throw new Error('Identity migration requires an isolated disposable target');
    if (command === 'status') {
      for (const m of migrations) report(`${m.id}: ${applied.some(row => row.id === m.id) ? 'applied' : 'pending'}`);
    } else if (command === 'down') {
      if (!last) { report('No applied migrations.'); return; }
      const m = migrations.find(m => m.id === last.id);
      await tx.unsafe(m.down);
      await tx`DELETE FROM trissea_migrations WHERE id=${m.id}`;
      report(`Rolled back ${m.id}`);
    } else {
      for (const m of pending) {
        await tx.unsafe(m.up);
        await tx`INSERT INTO trissea_migrations(id,checksum) VALUES (${m.id},${m.checksum})`;
        report(`Applied ${m.id}`);
      }
    }
  });
}
