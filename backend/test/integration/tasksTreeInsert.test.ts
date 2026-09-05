import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

/**
 * 5.2 acceptance: a failure mid-tree leaves zero rows.
 *
 * The failure is provoked below the root on purpose — a non-existent skill id
 * on a *grandchild*, which violates `task_skills.skill_id`'s foreign key only
 * after the root and the child have already been inserted. If the recursion
 * were not running inside one transaction on one client, those two earlier
 * rows would survive the error and the tree would be half-built.
 *
 * `insertTaskTree` is called directly rather than through `POST /tasks`
 * because the route validates every skill id in the tree up front (5.2), so
 * this particular failure can never reach the database via HTTP. Bypassing
 * the route is the point: it tests that the transaction, not the validation,
 * is what guarantees the rollback.
 */
describe('insertTaskTree transaction (5.2, REQ-5.7)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  async function countTasks(): Promise<number> {
    const { rows } = await server.pool.query<{ count: string }>('SELECT count(*) FROM tasks');
    return Number(rows[0]!.count);
  }

  async function countTaskSkills(): Promise<number> {
    const { rows } = await server.pool.query<{ count: string }>('SELECT count(*) FROM task_skills');
    return Number(rows[0]!.count);
  }

  /** Current value of the `tasks` id sequence — advances even on rollback. */
  async function lastTaskId(): Promise<number> {
    const { rows } = await server.pool.query<{ last_value: string }>(
      "SELECT last_value FROM pg_sequences WHERE sequencename = 'tasks_id_seq'",
    );
    return Number(rows[0]!.last_value ?? 0);
  }

  it('rolls the whole tree back when a grandchild fails, leaving zero rows', async () => {
    const { insertTaskTree } = await import('../../src/db/tasks.js');

    const tasksBefore = await countTasks();
    const skillsBefore = await countTaskSkills();
    const seqBefore = await lastTaskId();

    await expect(
      insertTaskTree(server.pool, {
        title: 'Root that must not survive',
        skillIds: [1],
        subtasks: [
          {
            title: 'Child that must not survive',
            skillIds: [1],
            subtasks: [
              // 999999 does not exist in `skills` — the FK on task_skills
              // fails here, two levels in, after three task rows and two
              // task_skills rows have already been written.
              { title: 'Grandchild with a bad skill id', skillIds: [999_999], subtasks: [] },
            ],
          },
        ],
      }),
    ).rejects.toThrow();

    expect(await countTasks()).toBe(tasksBefore);
    expect(await countTaskSkills()).toBe(skillsBefore);

    const { rows } = await server.pool.query<{ title: string }>(
      "SELECT title FROM tasks WHERE title LIKE '%must not survive%'",
    );
    expect(rows).toEqual([]);

    // Proof the failure really was *mid*-tree rather than before the first
    // write: Postgres sequences are non-transactional, so `tasks_id_seq`
    // still shows the three ids the rolled-back inserts consumed. Rows were
    // written and then undone — the assertions above are not just passing
    // because nothing was ever attempted.
    const seqAfter = await lastTaskId();
    expect(seqAfter).toBe(seqBefore + 3);
  });

  it('leaves the pool usable afterwards — the failed client was released, not leaked', async () => {
    const { insertTaskTree } = await import('../../src/db/tasks.js');

    const rootId = await insertTaskTree(server.pool, {
      title: 'Root after rollback',
      skillIds: [],
      subtasks: [{ title: 'Child after rollback', skillIds: [], subtasks: [] }],
    });

    const { rows } = await server.pool.query<{ id: number; parent_task_id: number | null }>(
      'SELECT id, parent_task_id FROM tasks WHERE id = $1 OR parent_task_id = $1 ORDER BY id',
      [rootId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.parent_task_id).toBeNull();
    expect(rows[1]!.parent_task_id).toBe(rootId);
  });
});
