import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TaskNode } from '../../src/types/task.js';
import type { ErrorResponse } from '../../src/types/error.js';

// See the note in tasksLlmStub.test.ts: the mode must be set before the app
// graph is imported, and each test file has its own module registry.
process.env.LLM_MODE = 'fail';
delete process.env.LLM_API_KEY;

const { startTestServer } = await import('../helpers/testServer.js');
type TestServer = Awaited<ReturnType<typeof startTestServer>>;

/**
 * 6.8 — `POST /tasks` with `LLM_MODE=fail` (REQ-0.9, REQ-6.4, REQ-6.6).
 *
 * Every inference call throws, deterministically, which is the whole point of
 * the mode (design §5.4): the fallback path can be asserted without unplugging
 * a network. Task creation must still succeed — an external API being down
 * cannot be allowed to stop someone recording a task.
 */
describe('POST /tasks with LLM_MODE=fail (6.8, REQ-6.4, REQ-6.6)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  async function post(body: unknown): Promise<{ status: number; task: TaskNode }> {
    const res = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, task: (await res.json()) as TaskNode };
  }

  it('still creates the task, with an empty Skills list (REQ-6.4)', async () => {
    const { status, task } = await post({ title: 'Task nobody can classify' });

    expect(status).toBe(201);
    expect(task.id).toBeGreaterThan(0);
    expect(task.skills).toEqual([]);
  });

  it('marks the affected node with skillInferenceFailed (REQ-6.6)', async () => {
    const { task } = await post({
      title: 'Root with no skills',
      subtasks: [
        { title: 'Child the user gave skills to', skillIds: [1] },
        { title: 'Child with no skills', subtasks: [{ title: 'Grandchild with no skills' }] },
      ],
    });

    expect(task.skillInferenceFailed).toBe(true);
    // Never attempted for this one — the user supplied skills, so there is no
    // failure to report and the field must stay absent.
    expect(task.subtasks[0]!.skillInferenceFailed).toBeUndefined();
    expect(task.subtasks[0]!.skills.map((skill) => skill.name)).toEqual(['Frontend']);
    expect(task.subtasks[1]!.skillInferenceFailed).toBe(true);
    expect(task.subtasks[1]!.subtasks[0]!.skillInferenceFailed).toBe(true);
  });

  it('persists the whole tree — nothing is rolled back by the LLM failure', async () => {
    const { task } = await post({
      title: 'Saved despite the LLM',
      subtasks: [{ title: 'Also saved' }],
    });

    const res = await fetch(`${server.baseUrl}/tasks/${task.id}`);
    const fetched = (await res.json()) as TaskNode;

    expect(res.status).toBe(200);
    expect(fetched.title).toBe('Saved despite the LLM');
    expect(fetched.subtasks.map((node) => node.title)).toEqual(['Also saved']);
    expect(fetched.skills).toEqual([]);
  });

  it('does not store the flag — it is response-only (design §4.1)', async () => {
    const { task } = await post({ title: 'Flagged in the response only' });

    const res = await fetch(`${server.baseUrl}/tasks/${task.id}`);
    const fetched = (await res.json()) as TaskNode;

    expect('skillInferenceFailed' in fetched).toBe(false);

    const listRes = await fetch(`${server.baseUrl}/tasks`);
    const list = (await listRes.json()) as TaskNode[];
    expect(JSON.stringify(list)).not.toContain('skillInferenceFailed');
  });

  it('logs the title and the reason server-side (design §5.3)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await post({ title: 'Logged failure title' });

      expect(warn).toHaveBeenCalledWith(
        'llm: skill inference failed for "Logged failure title": LLM_MODE=fail',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps every other POST /tasks failure mode intact — a bad skill id is still a 400', async () => {
    const res = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Bad skill id', skillIds: [999_999] }),
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorResponse).error.code).toBe('VALIDATION_ERROR');
  });
});
