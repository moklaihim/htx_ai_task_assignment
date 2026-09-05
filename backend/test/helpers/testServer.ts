import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';
import { createTestDatabase } from './testDatabase.js';

export interface TestServer {
  /** Base URL of the in-process app, e.g. `http://127.0.0.1:54213`. */
  baseUrl: string;
  /**
   * The app's own `pg` Pool, pointed at this run's disposable database. Tests
   * that need to look at (or provoke) database state directly — counting rows
   * left behind by a rolled-back transaction, say — use this rather than
   * opening a second pool, so they see exactly what the app sees.
   */
  pool: Pool;
  /** Closes the HTTP server, the app's pg Pool, and drops the test database. */
  close(): Promise<void>;
}

/**
 * Boots a disposable, migrated + seeded Postgres database and the Express app
 * in-process against it, listening on an ephemeral port (design §8.2). Tests
 * call it with Node's global `fetch` — no Docker, no separately-running
 * server (REQ-0.9).
 *
 * `DATABASE_URL` is set *before* anything that reads it is imported: `src/db/
 * pool.ts` opens its `pg` Pool as a module-load side effect, so importing it
 * (even transitively, via `app.js`) before the env var points at the test
 * database would connect the app to the wrong one.
 */
export async function startTestServer(): Promise<TestServer> {
  const db = await createTestDatabase();
  process.env.DATABASE_URL = db.url;

  const { pool } = await import('../../src/db/pool.js');
  const { runMigrations } = await import('../../db/migrate.js');
  const { runSeed } = await import('../../db/seed.js');
  const { createApp } = await import('../../src/app.js');

  await runMigrations(pool);
  await runSeed(pool);

  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    pool,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await pool.end();
      await db.drop();
    },
  };
}
