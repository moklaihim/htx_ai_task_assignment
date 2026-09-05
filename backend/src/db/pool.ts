import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({
  connectionString,
  // Bound the wait so /health/db fails fast with 503 instead of hanging when
  // Postgres is unreachable (REQ-0.4).
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 3000),
});

// A pool-level error (e.g. Postgres going away) must not take the process down —
// /health/db has to be able to report the failure (REQ-0.4).
pool.on('error', (err) => {
  console.error('unexpected postgres pool error:', err.message);
});

export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
