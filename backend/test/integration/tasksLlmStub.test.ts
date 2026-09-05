import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TaskNode } from '../../src/types/task.js';

// Set before `startTestServer` imports anything: `src/llm/config.ts` reads the
// environment once, at module load (design §5.1), so the mode has to be in
// place before the app graph is imported. Vitest gives each test file its own
// module registry, which is why `stub` here and `fail` in the sibling file do
// not collide.
process.env.LLM_MODE = 'stub';
delete process.env.LLM_API_KEY;

const { startTestServer } = await import('../helpers/testServer.js');
type TestServer = Awaited<ReturnType<typeof startTestServer>>;

/**
 * 6.8 — `POST /tasks` with `LLM_MODE=stub` (REQ-0.9, REQ-6.1–6.3).
 *
 * The success path, end to end and offline: no API key is set and no network
 * is reachable from these assertions, so anything that arrives in `skills`
 * came from inference wired into the route and written through the ordinary
 * insert path (design §5.4).
 */
describe('POST /tasks with LLM_MODE=stub (6.8, REQ-6.1, REQ-6.2, REQ-6.3)', () => {
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

  const names = (task: TaskNode) => task.skills.map((skill) => skill.name).sort();

  it('gives a task created with no skills its skills, with no user action (REQ-6.1)', async () => {
    const { status, task } = await post({
      title: 'As a visitor, I want a responsive homepage',
    });

    expect(status).toBe(201);
    expect(names(task)).toEqual(['Frontend']);
    expect(task.skillInferenceFailed).toBeUndefined();
  });

  it('classifies a subtask from its OWN title, not its parent’s (assumption 7)', async () => {
    const { task } = await post({
      title: 'As a visitor, I want a responsive homepage',
      subtasks: [
        { title: 'Add an audit log endpoint' },
        { title: 'Style the navigation', subtasks: [{ title: 'Cache the session token' }] },
      ],
    });

    expect(names(task)).toEqual(['Frontend']);
    expect(names(task.subtasks[0]!)).toEqual(['Backend']);
    expect(names(task.subtasks[1]!)).toEqual(['Frontend']);
    // Three levels deep, still classified standalone.
    expect(names(task.subtasks[1]!.subtasks[0]!)).toEqual(['Backend']);
  });

  it('persists the inferred skills before returning (REQ-6.2)', async () => {
    const { task } = await post({
      title: 'Add an audit log endpoint',
      subtasks: [{ title: 'Style the dashboard' }],
    });

    const { rows } = await server.pool.query<{ title: string; name: string }>(
      `SELECT t.title, s.name
         FROM tasks t
         JOIN task_skills ts ON ts.task_id = t.id
         JOIN skills s ON s.id = ts.skill_id
        WHERE t.id = $1 OR t.parent_task_id = $1
        ORDER BY t.id`,
      [task.id],
    );

    expect(rows).toEqual([
      { title: 'Add an audit log endpoint', name: 'Backend' },
      { title: 'Style the dashboard', name: 'Frontend' },
    ]);
  });

  it('leaves user-supplied skills untouched — inference only fills empties', async () => {
    const { task } = await post({
      // A title the stub would classify as Frontend, overridden by the user.
      title: 'As a visitor, I want a responsive homepage',
      skillIds: [2],
      subtasks: [{ title: 'Add an audit log endpoint', skillIds: [1, 2] }],
    });

    expect(names(task)).toEqual(['Backend']);
    expect(names(task.subtasks[0]!)).toEqual(['Backend', 'Frontend']);
  });

  it('never returns the response-only flag on a GET (design §4.1)', async () => {
    const { task } = await post({ title: 'Style the login screen' });

    const res = await fetch(`${server.baseUrl}/tasks/${task.id}`);
    const fetched = (await res.json()) as TaskNode;

    expect(names(fetched)).toEqual(['Frontend']);
    expect('skillInferenceFailed' in fetched).toBe(false);
  });

  it('classifies a whole tree of unskilled nodes in one request', async () => {
    const { status, task } = await post({
      title: 'Build the reporting feature',
      subtasks: [
        { title: 'Design the dashboard layout' },
        { title: 'Write the aggregation queries' },
        { title: 'Add the export endpoint' },
      ],
    });

    expect(status).toBe(201);
    expect(task.subtasks.map(names)).toEqual([['Frontend'], ['Backend'], ['Backend']]);
    expect(task.subtasks.every((node) => node.skills.length > 0)).toBe(true);
  });
});
