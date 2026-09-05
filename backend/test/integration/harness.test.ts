import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

describe('integration test harness (design §8.2)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  it('boots the app against a migrated + seeded disposable database, reachable via fetch', async () => {
    const health = await fetch(`${server.baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    const healthDb = await fetch(`${server.baseUrl}/health/db`);
    expect(healthDb.status).toBe(200);

    // REQ-1.9 seed data is present, proving runMigrations + runSeed ran
    // against this disposable database, not whatever DATABASE_URL pointed at
    // before the harness took over.
    const developers = await fetch(`${server.baseUrl}/developers`);
    const body = (await developers.json()) as Array<{ name: string }>;
    expect(body.map((d) => d.name).sort()).toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
  });
});
