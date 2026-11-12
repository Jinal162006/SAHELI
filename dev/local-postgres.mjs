// Local PostgreSQL for development and tests. Never used in production.
// Production uses Supabase Postgres (see docs/ARCHITECTURE.md).
//
// Usage: npm run db   (from the dev/ folder)
// Listens on 127.0.0.1:54329 and creates the `saheli` and `saheli_test` databases.

import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '.pgdata');
const port = Number(process.env.LOCAL_PG_PORT || 54329);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: process.env.LOCAL_PG_PASSWORD || 'postgres',
  port,
  persistent: true,
  onLog: () => {},
  onError: (message) => console.error('[postgres]', String(message).trim()),
});

const firstRun = !existsSync(path.join(dataDir, 'PG_VERSION'));
if (firstRun) {
  console.log('Initialising local Postgres data directory...');
  await pg.initialise();
}
await pg.start();

for (const name of ['saheli', 'saheli_test']) {
  try {
    await pg.createDatabase(name);
    console.log(`Created database ${name}`);
  } catch {
    // Already exists.
  }
}

console.log(`Local Postgres ready on 127.0.0.1:${port} (Ctrl+C to stop)`);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
