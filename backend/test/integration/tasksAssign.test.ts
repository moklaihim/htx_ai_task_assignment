import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

interface TaskDto {
  id: number;
  title: string;
  assignee: { id: number; name: string } | null;
}

interface DeveloperDto {
  id: number;
  name: string;
}

async function createFrontendOnlyTask(baseUrl: string): Promise<TaskDto> {
  const skills = (await (await fetch(`${baseUrl}/skills`)).json()) as Array<{
    id: number;
    name: string;
  }>;
  const frontendId = skills.find((s) => s.name === 'Frontend')!.id;

  const res = await fetch(`${baseUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Frontend-only task', skillIds: [frontendId] }),
  });
  return (await res.json()) as TaskDto;
}

async function developerByName(baseUrl: string, name: string): Promise<DeveloperDto> {
  const developers = (await (await fetch(`${baseUrl}/developers`)).json()) as DeveloperDto[];
  return developers.find((d) => d.name === name)!;
}

describe('PATCH /tasks/:id/assign (3.7, REQ-2.4)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  it('Bob (Backend only) assigned to a Frontend-only task -> 400 SKILL_MISMATCH, assignee unchanged', async () => {
    const task = await createFrontendOnlyTask(server.baseUrl);
    const bob = await developerByName(server.baseUrl, 'Bob');

    const res = await fetch(`${server.baseUrl}/tasks/${task.id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: bob.id }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SKILL_MISMATCH');

    const reread = (await (await fetch(`${server.baseUrl}/tasks/${task.id}`)).json()) as TaskDto;
    expect(reread.assignee).toBeNull();
  });

  it('Carol (Frontend, Backend) assigned to the same Frontend-only task -> 200', async () => {
    const task = await createFrontendOnlyTask(server.baseUrl);
    const carol = await developerByName(server.baseUrl, 'Carol');

    const res = await fetch(`${server.baseUrl}/tasks/${task.id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: carol.id }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as TaskDto;
    expect(updated.assignee).toEqual({ id: carol.id, name: 'Carol' });
  });

  it('a task with no required skills accepts any developer', async () => {
    const createRes = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Anyone can do this' }),
    });
    const task = (await createRes.json()) as TaskDto;
    const bob = await developerByName(server.baseUrl, 'Bob');

    const res = await fetch(`${server.baseUrl}/tasks/${task.id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: bob.id }),
    });
    expect(res.status).toBe(200);
  });

  it('assigneeId: null unassigns a task', async () => {
    const task = await createFrontendOnlyTask(server.baseUrl);
    const carol = await developerByName(server.baseUrl, 'Carol');

    await fetch(`${server.baseUrl}/tasks/${task.id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: carol.id }),
    });

    const res = await fetch(`${server.baseUrl}/tasks/${task.id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: null }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as TaskDto;
    expect(updated.assignee).toBeNull();
  });

  it('404s on an unknown task', async () => {
    const carol = await developerByName(server.baseUrl, 'Carol');
    const res = await fetch(`${server.baseUrl}/tasks/999999/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: carol.id }),
    });
    expect(res.status).toBe(404);
  });

  it('404s on an unknown developer id', async () => {
    const task = await createFrontendOnlyTask(server.baseUrl);
    const res = await fetch(`${server.baseUrl}/tasks/${task.id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: 999999 }),
    });
    expect(res.status).toBe(404);
  });
});
