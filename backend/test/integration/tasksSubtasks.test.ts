import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

interface TaskDto {
  id: number;
  title: string;
  status: string;
  parentTaskId: number | null;
  skills: { id: number; name: string }[];
  subtasks: TaskDto[];
  /** Present only on `POST /tasks` responses (design §4.1, REQ-6.6). */
  skillInferenceFailed?: boolean;
  /** Present iff `skillInferenceFailed` is `true`. */
  skillInferenceFailureReason?: string;
  /** Likewise, for the REQ-6.8 "not a software task" outcome. */
  skillInferenceUnclassifiable?: boolean;
  /** Likewise, for the REQ-6.9 "the LLM chose these skills" outcome. */
  skillInferenceApplied?: boolean;
}

interface ErrorDto {
  error: { code: string; message: string };
}

// Seeded skill ids (db/seed.sql): Frontend=1, Backend=2.
const FRONTEND = 1;
const BACKEND = 2;

/** A POST response tree with the response-only inference markers removed. */
function withoutInferenceFlags(task: TaskDto): TaskDto {
  const {
    skillInferenceFailed: _failed,
    skillInferenceFailureReason: _reason,
    skillInferenceUnclassifiable: _unclassifiable,
    skillInferenceApplied: _applied,
    ...rest
  } = task;
  return { ...rest, subtasks: task.subtasks.map(withoutInferenceFlags) };
}

describe('nested create and the recursive Done rule (5.6, REQ-0.9, REQ-2.1, REQ-5.3, REQ-5.7)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  async function post(body: unknown): Promise<{ status: number; body: TaskDto & ErrorDto }> {
    const res = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as TaskDto & ErrorDto };
  }

  async function patchStatus(
    id: number,
    status: string,
  ): Promise<{ status: number; body: TaskDto & ErrorDto }> {
    const res = await fetch(`${server.baseUrl}/tasks/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return { status: res.status, body: (await res.json()) as TaskDto & ErrorDto };
  }

  async function get(id: number): Promise<TaskDto> {
    return (await (await fetch(`${server.baseUrl}/tasks/${id}`)).json()) as TaskDto;
  }

  describe('nested create (REQ-2.1, REQ-5.7)', () => {
    it('creates a whole three-level tree from one request and reads it back with nesting intact', async () => {
      const created = await post({
        title: 'Parent task',
        skillIds: [FRONTEND],
        subtasks: [
          {
            title: 'Child A',
            skillIds: [],
            subtasks: [{ title: 'Grandchild A1', skillIds: [BACKEND], subtasks: [] }],
          },
          { title: 'Child B', skillIds: [], subtasks: [] },
        ],
      });

      expect(created.status).toBe(201);
      const root = created.body;

      // The POST response is already the whole tree…
      expect(root.title).toBe('Parent task');
      expect(root.parentTaskId).toBeNull();
      expect(root.skills.map((skill) => skill.name)).toEqual(['Frontend']);
      expect(root.subtasks.map((task) => task.title)).toEqual(['Child A', 'Child B']);

      const childA = root.subtasks[0]!;
      expect(childA.parentTaskId).toBe(root.id);
      expect(childA.skills).toEqual([]);
      expect(childA.subtasks.map((task) => task.title)).toEqual(['Grandchild A1']);

      const grandchild = childA.subtasks[0]!;
      expect(grandchild.parentTaskId).toBe(childA.id);
      expect(grandchild.skills.map((skill) => skill.name)).toEqual(['Backend']);
      expect(grandchild.subtasks).toEqual([]);

      // …and a fresh read agrees with it, so the nesting is stored, not just
      // echoed back from the request body. The POST response also carries the
      // response-only `skillInferenceFailed` marker on nodes the LLM couldn't
      // classify (the harness's default `fail` mode marks "Child A" and
      // "Child B"), which a GET must not have — hence dropping it here.
      expect(await get(root.id)).toEqual(withoutInferenceFlags(root));
    });

    it('gives every node a status and an assignee, exactly as a top-level task has (REQ-5.2)', async () => {
      const { body: root } = await post({
        title: 'Shape parent',
        subtasks: [{ title: 'Shape child' }],
      });

      for (const node of [root, root.subtasks[0]!]) {
        expect(node.status).toBe('To-do');
        expect(node).toHaveProperty('assignee', null);
        expect(node).toHaveProperty('skills', []);
        expect(node).toHaveProperty('subtasks');
      }
    });

    it('nests to arbitrary depth — five levels in one request (REQ-1.10)', async () => {
      const { status, body } = await post({
        title: 'L1',
        subtasks: [
          { title: 'L2', subtasks: [{ title: 'L3', subtasks: [{ title: 'L4', subtasks: [{ title: 'L5' }] }] }] },
        ],
      });
      expect(status).toBe(201);

      const titles: string[] = [];
      let cursor: TaskDto | undefined = await get(body.id);
      while (cursor) {
        titles.push(cursor.title);
        cursor = cursor.subtasks[0];
      }
      expect(titles).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    });

    it('rejects a malformed grandchild with 400 and writes nothing (REQ-5.7)', async () => {
      const before = await (await fetch(`${server.baseUrl}/tasks`)).json();

      const { status, body } = await post({
        title: 'Root that must not be created',
        subtasks: [{ title: 'Child', subtasks: [{ title: '' }] }],
      });

      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('subtasks.0.subtasks.0.title');

      // Not even the valid root above it was written.
      expect(await (await fetch(`${server.baseUrl}/tasks`)).json()).toEqual(before);
    });

    it('rejects an unknown skill id on a grandchild with 400 VALIDATION_ERROR, not a 500', async () => {
      const { status, body } = await post({
        title: 'Root with a bad deep skill id',
        subtasks: [{ title: 'Child', subtasks: [{ title: 'Grandchild', skillIds: [999_999] }] }],
      });

      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('999999');
    });
  });

  describe('the recursive Done rule (REQ-5.3, REQ-2.5)', () => {
    /**
     * Builds the state from design §4.3's worked example:
     *
     *   parent      To-do   ← the request target
     *   └─ child    Done
     *      └─ gc    To-do   ← blocking, two levels down
     *
     * Reached by walking the grandchild Done, then the child Done, then the
     * grandchild back to To-do — the rule is one-directional, so moving away
     * from Done is always allowed.
     */
    async function threeLevelTree() {
      const { body: parent } = await post({
        title: 'Done-rule parent',
        subtasks: [{ title: 'Done-rule child', subtasks: [{ title: 'Done-rule grandchild' }] }],
      });
      const child = parent.subtasks[0]!;
      const grandchild = child.subtasks[0]!;

      expect((await patchStatus(grandchild.id, 'Done')).status).toBe(200);
      expect((await patchStatus(child.id, 'Done')).status).toBe(200);
      expect((await patchStatus(grandchild.id, 'To-do')).status).toBe(200);

      return { parent, child, grandchild };
    }

    it('blocks Done on a non-Done grandchild even when the direct child is Done', async () => {
      const { parent, child, grandchild } = await threeLevelTree();

      // Precondition: the only thing not Done is two levels down. A
      // direct-children-only check would see just the Done child and allow it.
      expect((await get(child.id)).status).toBe('Done');
      expect((await get(grandchild.id)).status).toBe('To-do');

      const blocked = await patchStatus(parent.id, 'Done');

      expect(blocked.status).toBe(400);
      expect(blocked.body.error.code).toBe('SUBTASKS_NOT_DONE');
      expect(await get(parent.id).then((task) => task.status)).toBe('To-do');
    });

    it('allows Done once every descendant is Done', async () => {
      const { parent, grandchild } = await threeLevelTree();

      expect((await patchStatus(grandchild.id, 'Done')).status).toBe(200);

      const allowed = await patchStatus(parent.id, 'Done');

      expect(allowed.status).toBe(200);
      expect(allowed.body.status).toBe('Done');
      expect(await get(parent.id).then((task) => task.status)).toBe('Done');
    });

    it('blocks Done on a To-do direct child too', async () => {
      const { body: parent } = await post({
        title: 'Blocked by a child',
        subtasks: [{ title: 'Plain To-do child' }],
      });

      const blocked = await patchStatus(parent.id, 'Done');

      expect(blocked.status).toBe(400);
      expect(blocked.body.error.code).toBe('SUBTASKS_NOT_DONE');
    });

    it('blocks Done on an In Progress descendant, not only a To-do one', async () => {
      const { body: parent } = await post({
        title: 'Blocked by In Progress',
        subtasks: [{ title: 'Child', subtasks: [{ title: 'Grandchild' }] }],
      });
      const grandchild = parent.subtasks[0]!.subtasks[0]!;

      expect((await patchStatus(grandchild.id, 'In Progress')).status).toBe(200);

      const blocked = await patchStatus(parent.id, 'Done');
      expect(blocked.status).toBe(400);
      expect(blocked.body.error.code).toBe('SUBTASKS_NOT_DONE');
    });

    it('applies the rule at every level, not just to roots', async () => {
      const { body: parent } = await post({
        title: 'Mid-tree target',
        subtasks: [{ title: 'Middle', subtasks: [{ title: 'Bottom' }] }],
      });
      const middle = parent.subtasks[0]!;

      // The target here is itself a subtask — REQ-5.3 covers "a Task or subtask".
      const blocked = await patchStatus(middle.id, 'Done');
      expect(blocked.status).toBe(400);
      expect(blocked.body.error.code).toBe('SUBTASKS_NOT_DONE');
    });

    it('allows Done on a leaf, which has no descendants to block it', async () => {
      const { body: parent } = await post({
        title: 'Leaf-only parent',
        subtasks: [{ title: 'Leaf' }],
      });

      const allowed = await patchStatus(parent.subtasks[0]!.id, 'Done');
      expect(allowed.status).toBe(200);
      expect(allowed.body.status).toBe('Done');
    });

    it('never blocks a status other than Done', async () => {
      const { body: parent } = await post({
        title: 'Non-Done statuses',
        subtasks: [{ title: 'Still To-do child' }],
      });

      for (const status of ['In Progress', 'To-do']) {
        const res = await patchStatus(parent.id, status);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(status);
      }
    });

    it('lets a Done parent move back to To-do even though its subtasks are Done', async () => {
      const { body: parent } = await post({
        title: 'Reopened parent',
        subtasks: [{ title: 'Finished child' }],
      });
      expect((await patchStatus(parent.subtasks[0]!.id, 'Done')).status).toBe(200);
      expect((await patchStatus(parent.id, 'Done')).status).toBe(200);

      const reopened = await patchStatus(parent.id, 'To-do');
      expect(reopened.status).toBe(200);
      expect(reopened.body.status).toBe('To-do');
    });
  });
});
