import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

interface TaskDto {
  id: number;
  title: string;
  status: string;
  assignee: { id: number; name: string } | null;
  skills: Array<{ id: number; name: string }>;
  subtasks: TaskDto[];
}

interface SkillDto {
  id: number;
  name: string;
}

async function skillIdByName(baseUrl: string, name: string): Promise<number> {
  const skills = (await (await fetch(`${baseUrl}/skills`)).json()) as SkillDto[];
  return skills.find((s) => s.name === name)!.id;
}

describe('GET /tasks, GET /tasks/:id, POST /tasks (3.4, 3.5, REQ-2.1-2.3)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  it('GET /tasks returns [] against a freshly seeded database with no tasks yet', async () => {
    const res = await fetch(`${server.baseUrl}/tasks`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('POST /tasks with an empty title -> 400, and writes no row', async () => {
    const before = (await (await fetch(`${server.baseUrl}/tasks`)).json()) as TaskDto[];

    const res = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const after = (await (await fetch(`${server.baseUrl}/tasks`)).json()) as TaskDto[];
    expect(after).toEqual(before);
  });

  it('POST /tasks with an unknown skill id -> 400, and writes no row', async () => {
    const before = (await (await fetch(`${server.baseUrl}/tasks`)).json()) as TaskDto[];

    const res = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Bad skill task', skillIds: [999999] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const after = (await (await fetch(`${server.baseUrl}/tasks`)).json()) as TaskDto[];
    expect(after).toEqual(before);
  });

  it('POST /tasks creates a task with skills as an array (never [null]), then GET /tasks lists it top-level', async () => {
    const frontendId = await skillIdByName(server.baseUrl, 'Frontend');

    const createRes = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Build the login page', skillIds: [frontendId] }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as TaskDto;
    expect(created.title).toBe('Build the login page');
    expect(created.status).toBe('To-do');
    expect(created.assignee).toBeNull();
    expect(created.skills).toEqual([{ id: frontendId, name: 'Frontend' }]);
    expect(created.subtasks).toEqual([]);

    const noSkillsRes = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'A task with no required skills' }),
    });
    const noSkillsTask = (await noSkillsRes.json()) as TaskDto;
    expect(noSkillsTask.skills).toEqual([]); // never [null]

    const listRes = await fetch(`${server.baseUrl}/tasks`);
    const list = (await listRes.json()) as TaskDto[];
    const ids = list.map((t) => t.id);
    expect(ids).toContain(created.id);
    expect(ids).toContain(noSkillsTask.id);
  });

  it('GET /tasks/:id reads one task', async () => {
    const createRes = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Solo task' }),
    });
    const created = (await createRes.json()) as TaskDto;

    const res = await fetch(`${server.baseUrl}/tasks/${created.id}`);
    expect(res.status).toBe(200);
    const task = (await res.json()) as TaskDto;
    expect(task.title).toBe('Solo task');
    expect(task.subtasks).toEqual([]);
  });

  it('GET /tasks/:id 404s on an unknown task', async () => {
    const res = await fetch(`${server.baseUrl}/tasks/999999`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
