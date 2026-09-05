import { useEffect, useState } from 'react';
import { fetchDbHealth, fetchHealth } from '../api/health';

type Result = { ok: true; body: unknown } | { ok: false; error: string };

function render(result: Result | null): string {
  if (result === null) return 'loading…';
  return result.ok ? JSON.stringify(result.body) : `error: ${result.error}`;
}

export function HealthPage() {
  const [health, setHealth] = useState<Result | null>(null);
  const [dbHealth, setDbHealth] = useState<Result | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((body) => setHealth({ ok: true, body }))
      .catch((err: Error) => setHealth({ ok: false, error: err.message }));

    fetchDbHealth()
      .then((body) => setDbHealth({ ok: true, body }))
      .catch((err: Error) => setDbHealth({ ok: false, error: err.message }));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Task Assignment</h1>
      <p>Phase 1 walking skeleton — the frontend reaches the backend, the backend reaches Postgres.</p>
      <dl>
        <dt>
          <strong>GET /api/health</strong>
        </dt>
        <dd data-testid="health">{render(health)}</dd>
        <dt>
          <strong>GET /api/health/db</strong>
        </dt>
        <dd data-testid="health-db">{render(dbHealth)}</dd>
      </dl>
    </main>
  );
}
