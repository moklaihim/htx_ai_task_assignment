import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

interface TaskDto {
  id: number;
  title: string;
  parentTaskId: number | null;
  subtasks: TaskDto[];
}

/** Every node of a forest, flattened — used to look for duplicates. */
function flatten(nodes: TaskDto[]): TaskDto[] {
  return nodes.flatMap((node) => [node, ...flatten(node.subtasks)]);
}

/**
 * 5.3 acceptance: subtasks never appear twice in `GET /tasks`.
 *
 * Guards against the obvious failure mode: `SELECT * FROM tasks` returns
 * every row flat, so listing them directly would show each subtask once at
 * the top level and once nested under its parent. The `parent_task_id IS
 * NULL` anchor prevents that — descendants enter only through the recursive
 * term, and `buildForest` nests each one under its parent.
 */
describe('GET /tasks roots-only, GET /tasks/:id as root (5.3, REQ-2.2, REQ-2.3)', () => {
  let server: TestServer;
  let rootId: number;
  let childId: number;
  let grandchildId: number;
  let siblingRootId: number;

  beforeAll(async () => {
    server = await startTestServer();

    const res = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Root',
        skillIds: [1],
        subtasks: [
          { title: 'Child', skillIds: [2], subtasks: [{ title: 'Grandchild', skillIds: [] }] },
        ],
      }),
    });
    const root = (await res.json()) as TaskDto;
    rootId = root.id;
    childId = root.subtasks[0]!.id;
    grandchildId = root.subtasks[0]!.subtasks[0]!.id;

    const sibling = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Sibling root' }),
    });
    siblingRootId = ((await sibling.json()) as TaskDto).id;
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  async function getTasks(): Promise<TaskDto[]> {
    const res = await fetch(`${server.baseUrl}/tasks`);
    expect(res.status).toBe(200);
    return (await res.json()) as TaskDto[];
  }

  it('lists only roots at the top level', async () => {
    const tasks = await getTasks();

    expect(tasks.every((task) => task.parentTaskId === null)).toBe(true);
    expect(tasks.map((task) => task.id)).toEqual([rootId, siblingRootId]);
  });

  it('never lists a subtask twice', async () => {
    const all = flatten(await getTasks());
    const ids = all.map((task) => task.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort((a, b) => a - b)).toEqual([rootId, childId, grandchildId, siblingRootId]);
    // Specifically: the child and grandchild appear, but only nested.
    expect(ids.filter((id) => id === childId)).toHaveLength(1);
    expect(ids.filter((id) => id === grandchildId)).toHaveLength(1);
  });

  it('nests the whole three-level tree under its root', async () => {
    const tasks = await getTasks();
    const root = tasks.find((task) => task.id === rootId)!;

    expect(root.subtasks).toHaveLength(1);
    expect(root.subtasks[0]!.id).toBe(childId);
    expect(root.subtasks[0]!.subtasks).toHaveLength(1);
    expect(root.subtasks[0]!.subtasks[0]!.id).toBe(grandchildId);
    expect(root.subtasks[0]!.subtasks[0]!.subtasks).toEqual([]);
  });

  it('returns the target as the root of the response even when it is itself a subtask', async () => {
    const res = await fetch(`${server.baseUrl}/tasks/${childId}`);
    expect(res.status).toBe(200);
    const child = (await res.json()) as TaskDto;

    // Its own parent is outside the fetched row set, so it is the root here…
    expect(child.id).toBe(childId);
    // …while still reporting the parent it actually has.
    expect(child.parentTaskId).toBe(rootId);
    expect(child.subtasks.map((task) => task.id)).toEqual([grandchildId]);
  });

  it('returns a leaf subtask as a root with no subtasks', async () => {
    const res = await fetch(`${server.baseUrl}/tasks/${grandchildId}`);
    const grandchild = (await res.json()) as TaskDto;

    expect(grandchild.id).toBe(grandchildId);
    expect(grandchild.parentTaskId).toBe(childId);
    expect(grandchild.subtasks).toEqual([]);
  });

  it('orders subtasks deterministically across repeated reads', async () => {
    const many = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Ordered root',
        subtasks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }, { title: 'E' }],
      }),
    });
    const created = (await many.json()) as TaskDto;
    const expected = created.subtasks.map((task) => task.title);
    expect(expected).toEqual(['A', 'B', 'C', 'D', 'E']);

    for (let i = 0; i < 5; i += 1) {
      const tasks = await getTasks();
      const ordered = tasks.find((task) => task.id === created.id)!;
      expect(ordered.subtasks.map((task) => task.title)).toEqual(expected);
    }
  });
});
