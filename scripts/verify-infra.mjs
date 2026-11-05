import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import postgres from 'postgres';
import { assertLocalDatabase } from './migration-policy.mjs';

assertLocalDatabase(process.env.DATABASE_URL, process.env.NODE_ENV);
const sql = postgres(process.env.DATABASE_URL, { max: 1, connection: { timezone: 'UTC' }, connect_timeout: 5 });
try {
  if (process.argv.includes('--rolled-back')) {
    const [state] = await sql`SELECT to_regclass('public.foundation_metadata') AS metadata, (SELECT count(*)::int FROM trissea_migrations) AS applied`;
    assert.equal(state.metadata, null);
    assert.equal(state.applied, 0);
    await sql`SELECT postgis_version()`;
  } else {
    const [row] = await sql`SELECT value, ST_AsText(ST_SetSRID(ST_MakePoint(121.7, 17.6), 4326)) AS point, current_setting('TimeZone') AS timezone FROM foundation_metadata WHERE key = 'milestone'`;
    assert.equal(row.value, 'M1');
    assert.equal(row.point, 'POINT(121.7 17.6)'); // Synthetic test coordinates, never logged.
    assert.equal(row.timezone, 'UTC');
  }
  const redis = new URL(process.env.REDIS_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(redis.hostname));
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: redis.hostname, port: Number(redis.port || 6379) });
    socket.setTimeout(5_000);
    socket.once('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'));
    let reply = '';
    socket.on('data', data => {
      reply += data.toString();
      if (reply.includes('\r\n')) {
        socket.end();
        if (reply === '+PONG\r\n') resolve();
        else reject(new Error('Redis unavailable'));
      }
    });
    socket.once('error', reject);
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Redis unavailable')); });
  });
  console.info(process.argv.includes('--rolled-back') ? 'Foundation rollback and retained PostGIS/Redis verified.' : 'Local PostGIS, UTC migration metadata and Redis PING verified.');
} catch { console.error('Infrastructure verification failed.'); process.exitCode = 1; }
finally { await sql.end({ timeout: 5 }); }
