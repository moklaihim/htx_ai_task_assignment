import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Pool } from 'pg';

// Resolved from this module rather than the working directory, so it is correct
// whether the runner is executed from source (tsx, tests) or from dist in the
// container. `npm run build` copies the .sql files next to the compiled JS.
const migrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url));

/**
 * Applies every migration file not yet recorded in `schema_migrations`, in
 * filename order (design §3.3). Each file and its bookkeeping row are committed
 * in one transaction, so a failing migration leaves no partial state behind.
 * Already-applied files are skipped, which is what makes repeated container
 * starts safe (REQ-7.4).
 *
 * @returns the filenames applied by this call — empty when nothing was pending.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const alreadyApplied = new Set(rows.map((r) => r.filename));

    for (const filename of files) {
      if (alreadyApplied.has(filename)) continue;

      const sql = await readFile(path.join(migrationsDir, filename), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${filename} failed: ${(err as Error).message}`, { cause: err });
      }

      applied.push(filename);
      console.log(`migrate: applied ${filename}`);
    }
  } finally {
    client.release();
  }

  if (applied.length === 0) {
    console.log('migrate: no pending migrations');
  }

  return applied;
}

// Only run when executed directly (entrypoint.sh); importing this module for
// tests must not connect to anything (design §3.4).
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const { pool } = await import('../src/db/pool.js');
  try {
    await runMigrations(pool);
  } catch (err) {
    console.error('migrate: failed —', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
