import { defineConfig, devices } from '@playwright/test';

/**
 * Runs a real browser against the already-running docker-compose stack —
 * nothing here starts or stops containers, because two of the eight
 * scenarios (E2E-7, E2E-8) need the `backend` service recreated with a
 * specific `LLM_MODE` (design §5.4), which a single shared `webServer` block
 * can't express per-test. Each spec file that needs a non-default `LLM_MODE`
 * manages that itself via `helpers/composeEnv.ts`.
 *
 * `baseURL` points at the frontend's published port (`FRONTEND_PORT` in
 * `.env`, default 3000) so tests only ever talk to the app the way a real
 * user's browser would — through the nginx `/api` proxy, never directly to
 * the backend's unpublished port 4000.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
