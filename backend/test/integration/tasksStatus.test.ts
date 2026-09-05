import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

interface TaskDto {
  id: number;
  status: string;
}

async function createTask(baseUrl: string, title: string): Promise<TaskDto> {
  const res = await fetch(`${baseUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return (await res.json()) as TaskDto;
}

describe('PATCH /tasks/:id/status (3.8, REQ-2.5 partial)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  it('updates status through each of the three valid values', async () => {
    const task = await createTask(server.baseUrl, 'Status walk');

    for (const status of ['In Progress', 'Done', 'To-do']) {
      const res = await fetch(`${server.baseUrl}/tasks/${task.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      expect(res.status).toBe(200);
      const updated = (await res.json()) as TaskDto;
      expect(updated.status).toBe(status);
    }
  });

  it('rejects a status outside the enum with 400 VALIDATION_ERROR, and does not change the stored status', async () => {
    const task = await createTask(server.baseUrl, 'Bad status target');

    const res = await fetch(`${server.baseUrl}/tasks/${task.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Blocked' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const reread = (await (await fetch(`${server.baseUrl}/tasks/${task.id}`)).json()) as TaskDto;
    expect(reread.status).toBe('To-do');
  });

  it('404s on an unknown task', async () => {
    const res = await fetch(`${server.baseUrl}/tasks/999999/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Done' }),
    });
    expect(res.status).toBe(404);
  });
});
