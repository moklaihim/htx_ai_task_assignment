import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Recreates the `backend` service with a specific `LLM_MODE` (design §5.4),
 * for the two scenarios that need it (task 7.3, E2E-7/E2E-8). `LLM_MODE` is
 * read once at process startup (`src/llm/config.ts`), so there is no way to
 * flip it on a running container — the container has to be recreated.
 *
 * This is safe against the live compose stack for the same reason
 * `docker-compose restart backend` is (design §7.3): the entrypoint reruns
 * the idempotent migration and seed on every start, so recreating the
 * container touches neither the `db` volume's data nor the `frontend`
 * service, and any Tasks earlier specs created are still there afterward.
 *
 * `--no-deps` is the reason this is quick and doesn't disturb `db`/`frontend`:
 * without it, `up` would also consider (and potentially recreate) the
 * services `backend` depends on.
 */
const COMPOSE_FILE = path.resolve(fileURLToPath(import.meta.url), '../../../docker-compose.yml');

function recreateBackend(env: NodeJS.ProcessEnv): void {
  execFileSync(
    'docker',
    ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--no-deps', '--force-recreate', 'backend'],
    { env, stdio: 'inherit' },
  );
}

/** Recreates `backend` with `LLM_MODE` forced to `mode`, then waits for it to be healthy. */
export async function setBackendLlmMode(mode: 'stub' | 'fail'): Promise<void> {
  recreateBackend({ ...process.env, LLM_MODE: mode });
  await waitForBackendHealthy();
}

/**
 * Recreates `backend` with no `LLM_MODE` override, so it falls back to
 * whatever `.env` specifies (the committed default is `live`) — leaving the
 * stack exactly as a reviewer running `docker-compose up` would find it.
 */
export async function resetBackendLlmMode(): Promise<void> {
  const env = { ...process.env };
  delete env.LLM_MODE;
  recreateBackend(env);
  await waitForBackendHealthy();
}

async function waitForBackendHealthy(timeoutMs = 30_000): Promise<void> {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health/db`);
      if (response.ok) {
        return;
      }
    } catch {
      // Backend not accepting connections yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`backend did not become healthy within ${timeoutMs}ms after LLM_MODE change`);
}
