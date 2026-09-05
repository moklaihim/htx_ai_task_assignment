import { describe, expect, it } from 'vitest';
import { buildForest } from '../../src/services/buildForest.js';
import type { TaskNode, TaskRow } from '../../src/types/task.js';

/** A mapped row as `db/tasks.ts` would hand it to `buildForest`. */
function row(id: number, parentTaskId: number | null, title = `Task ${id}`): TaskRow {
  return { id, title, status: 'To-do', parentTaskId, assignee: null, skills: [] };
}

/** The shape of a forest, as `id -> children`, for compact assertions. */
function outline(nodes: TaskNode[]): unknown {
  return nodes.map((node) => ({ id: node.id, subtasks: outline(node.subtasks) }));
}

describe('buildForest (5.5, design §4.4, REQ-0.9)', () => {
  it('returns [] for an empty row set', () => {
    expect(buildForest([])).toEqual([]);
  });

  it('nests a three-level tree under one root', () => {
    //  1
    //  └─ 2
    //     └─ 3
    const forest = buildForest([row(1, null), row(2, 1), row(3, 2)]);

    expect(outline(forest)).toEqual([{ id: 1, subtasks: [{ id: 2, subtasks: [{ id: 3, subtasks: [] }] }] }]);
  });

  it('nests a three-level tree regardless of the order rows arrive in', () => {
    // Children before their parents — a recursive CTE gives no order guarantee
    // of its own, so the algorithm must not depend on one. (The query adds an
    // ORDER BY for *sibling* determinism, not for parent-before-child.)
    const forest = buildForest([row(3, 2), row(2, 1), row(1, null)]);

    expect(outline(forest)).toEqual([{ id: 1, subtasks: [{ id: 2, subtasks: [{ id: 3, subtasks: [] }] }] }]);
  });

  it('preserves sibling order as given', () => {
    //  1
    //  ├─ 2
    //  ├─ 3
    //  └─ 4
    const forest = buildForest([row(1, null), row(2, 1), row(3, 1), row(4, 1)]);

    expect(forest[0]!.subtasks.map((node) => node.id)).toEqual([2, 3, 4]);
  });

  it('treats a subtask fetched as the target as the root of its own tree', () => {
    // What `GET /tasks/:id` on subtask 2 returns: the target and its
    // descendants only. Row 2's parent (1) is *not* in the set, so it must be
    // promoted to root rather than dropped — a bare `parentTaskId === null`
    // check would lose the whole tree here.
    const forest = buildForest([row(2, 1), row(3, 2)]);

    expect(outline(forest)).toEqual([{ id: 2, subtasks: [{ id: 3, subtasks: [] }] }]);
    // It still reports the parent it actually has in the database.
    expect(forest[0]!.parentTaskId).toBe(1);
  });

  it('treats a leaf subtask fetched as the target as a childless root', () => {
    const forest = buildForest([row(3, 2)]);

    expect(outline(forest)).toEqual([{ id: 3, subtasks: [] }]);
    expect(forest[0]!.parentTaskId).toBe(2);
  });

  it('returns every root when several trees are present', () => {
    //  1        10
    //  └─ 2     └─ 11
    const forest = buildForest([row(1, null), row(2, 1), row(10, null), row(11, 10)]);

    expect(outline(forest)).toEqual([
      { id: 1, subtasks: [{ id: 2, subtasks: [] }] },
      { id: 10, subtasks: [{ id: 11, subtasks: [] }] },
    ]);
  });

  it('never places a node in more than one place', () => {
    const forest = buildForest([row(1, null), row(2, 1), row(3, 2), row(4, 1), row(5, null)]);

    const flatten = (nodes: TaskNode[]): number[] =>
      nodes.flatMap((node) => [node.id, ...flatten(node.subtasks)]);
    const ids = flatten(forest);

    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it('copies rows rather than mutating the input', () => {
    const rows = [row(1, null), row(2, 1)];
    const forest = buildForest(rows);

    expect(forest[0]!.subtasks).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('subtasks');
  });

  it('carries every task property through onto the node', () => {
    const parent: TaskRow = {
      id: 1,
      title: 'Parent',
      status: 'In Progress',
      parentTaskId: null,
      assignee: { id: 3, name: 'Carol' },
      skills: [{ id: 1, name: 'Frontend' }],
    };

    const [node] = buildForest([parent, row(2, 1)]);

    expect(node).toMatchObject({
      id: 1,
      title: 'Parent',
      status: 'In Progress',
      assignee: { id: 3, name: 'Carol' },
      skills: [{ id: 1, name: 'Frontend' }],
    });
  });

  it('handles a deep chain without a depth limit', () => {
    // Ten levels — REQ-1.10's "arbitrary depth" has no cap anywhere.
    const rows = Array.from({ length: 10 }, (_, i) => row(i + 1, i === 0 ? null : i));
    const forest = buildForest(rows);

    let depth = 0;
    let cursor: TaskNode | undefined = forest[0];
    while (cursor) {
      depth += 1;
      cursor = cursor.subtasks[0];
    }

    expect(forest).toHaveLength(1);
    expect(depth).toBe(10);
  });
});
