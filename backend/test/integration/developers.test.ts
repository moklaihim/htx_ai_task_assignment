import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

interface SkillDto {
  id: number;
  name: string;
}

interface DeveloperDto {
  id: number;
  name: string;
  skills: SkillDto[];
  assignedTasks: Array<{ id: number; title: string; status: string }>;
}

describe('GET /skills, GET /developers, GET /developers/:id (3.3, REQ-2.6-2.8)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  it('GET /skills returns the two seeded skills', async () => {
    const res = await fetch(`${server.baseUrl}/skills`);
    expect(res.status).toBe(200);

    const skills = (await res.json()) as SkillDto[];
    expect(skills.map((s) => s.name).sort()).toEqual(['Backend', 'Frontend']);
  });

  it('GET /developers returns the four seeded developers, each with their skills', async () => {
    const res = await fetch(`${server.baseUrl}/developers`);
    expect(res.status).toBe(200);

    const developers = (await res.json()) as DeveloperDto[];
    expect(developers.map((d) => d.name).sort()).toEqual(['Alice', 'Bob', 'Carol', 'Dave']);

    const carol = developers.find((d) => d.name === 'Carol')!;
    expect(carol.skills.map((s) => s.name).sort()).toEqual(['Backend', 'Frontend']);
    expect(carol.assignedTasks).toEqual([]);

    const bob = developers.find((d) => d.name === 'Bob')!;
    expect(bob.skills.map((s) => s.name)).toEqual(['Backend']);
  });

  it('GET /developers/:id returns one developer', async () => {
    const list = await (await fetch(`${server.baseUrl}/developers`)).json() as DeveloperDto[];
    const alice = list.find((d) => d.name === 'Alice')!;

    const res = await fetch(`${server.baseUrl}/developers/${alice.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(alice);
  });

  it('GET /developers/:id 404s on an unknown developer', async () => {
    const res = await fetch(`${server.baseUrl}/developers/999999`);
    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
