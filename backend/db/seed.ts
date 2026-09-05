import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Pool } from 'pg';

// Same module-relative resolution as migrate.ts; `npm run build` copies seed.sql
// next to the compiled runner.
const seedFile = fileURLToPath(new URL('./seed.sql', import.meta.url));

/**
 * Executes db/seed.sql (REQ-1.9). The file's three statements are sent in a
 * single simple query, which Postgres runs sequentially in one implicit
 * transaction, so each statement sees the rows the previous one inserted
 * (design §3.4). The SQL itself is idempotent, so re-running on every container
 * start changes nothing after the first (REQ-7.4).
 */
export async function runSeed(pool: Pool): Promise<void> {
  const sql = await readFile(seedFile, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('seed: applied seed.sql');
  } finally {
    client.release();
  }
}

// Only run when executed directly (entrypoint.sh); importing this module for
// tests must not connect to anything (design §3.4).
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const { pool } = await import('../src/db/pool.js');
  try {
    await runSeed(pool);
  } catch (err) {
    console.error('seed: failed —', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
