import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

/**
 * Same host/user/password as the app's own `DATABASE_URL`, pointed at
 * Postgres's `postgres` maintenance database — the one every Postgres install
 * accepts `CREATE DATABASE`/`DROP DATABASE` on. Works against the
 * docker-compose `db` service or a local Postgres (REQ-0.9).
 */
function withDatabaseName(name: string): string {
  const base = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/taskdb';
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

export interface TestDatabase {
  /** Connection string for the newly created, empty database. */
  url: string;
  /** Drops the database. Safe to call once test teardown is done with it. */
  drop(): Promise<void>;
}

/**
 * Creates a fresh, empty, uniquely-named Postgres database, one per test run.
 * Callers run migrations and seed data into it themselves — this only
 * provisions the empty database, so it stays reusable regardless of schema.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const dbName = `taskdb_test_${randomUUID().replace(/-/g, '')}`;
  const admin = new Pool({ connectionString: withDatabaseName('postgres') });
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  return {
    url: withDatabaseName(dbName),
    async drop() {
      const admin2 = new Pool({ connectionString: withDatabaseName('postgres') });
      try {
        // A database cannot be dropped while another session holds a
        // connection to it — terminate any left over from the test run.
        await admin2.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
          [dbName],
        );
        await admin2.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      } finally {
        await admin2.end();
      }
    },
  };
}
