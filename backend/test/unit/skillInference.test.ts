import { describe, expect, it, vi } from 'vitest';
import {
  collectNodesNeedingSkills,
  inferMissingSkills,
} from '../../src/services/skillInference.js';
import type { CreateTaskRequest } from '../../src/schemas/task.js';

/** A parsed `POST /tasks` node, with the schema's defaults already applied. */
function node(
  title: string,
  skillIds: number[] = [],
  subtasks: CreateTaskRequest[] = [],
): CreateTaskRequest {
  return { title, skillIds, subtasks };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('collectNodesNeedingSkills (6.5, REQ-6.1)', () => {
  it('collects empty-skillIds nodes from the whole tree, not just the root', () => {
    const tree = node('Root', [], [node('Child A', [1]), node('Child B', [], [node('Grandchild')])]);

    expect(collectNodesNeedingSkills(tree).map((n) => n.title)).toEqual([
      'Root',
      'Child B',
      'Grandchild',
    ]);
  });

  it('skips nodes the user gave skills to', () => {
    const tree = node('Root', [1, 2], [node('Child', [2])]);

    expect(collectNodesNeedingSkills(tree)).toEqual([]);
  });

  it('returns the node objects themselves, in depth-first insert order', () => {
    const grandchild = node('Grandchild');
    const child = node('Child', [], [grandchild]);
    const tree = node('Root', [], [child]);

    expect(collectNodesNeedingSkills(tree)).toEqual([tree, child, grandchild]);
  });
});

describe('inferMissingSkills (6.5, REQ-6.2)', () => {
  it('writes inferred ids onto each node so the insert path persists them', async () => {
    const tree = node('Homepage', [], [node('Audit log')]);
    const nodes = collectNodesNeedingSkills(tree);

    const failures = await inferMissingSkills(nodes, async (title) =>
      title === 'Homepage' ? [1] : [2],
    );

    expect(failures).toEqual([]);
    expect(tree.skillIds).toEqual([1]);
    expect(tree.subtasks[0]!.skillIds).toEqual([2]);
  });

  it('one node failing leaves its siblings classified (Promise.allSettled)', async () => {
    const tree = node('Root', [], [node('Good A'), node('Bad'), node('Good B')]);
    const nodes = collectNodesNeedingSkills(tree);

    const failures = await inferMissingSkills(nodes, async (title) => {
      if (title === 'Bad') throw new Error('boom');
      return [1];
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]!.title).toBe('Bad');
    expect(failures[0]!.reason).toBe('boom');
    expect(tree.skillIds).toEqual([1]);
    expect(tree.subtasks.map((n) => n.skillIds)).toEqual([[1], [], [1]]);
  });

  it('one SLOW node does not block its siblings — they run concurrently', async () => {
    const SLOW_MS = 300;
    const tree = node(
      'Slow',
      [],
      [node('Fast A'), node('Fast B'), node('Fast C', [], [node('Fast D')])],
    );
    const nodes = collectNodesNeedingSkills(tree);

    const startedAt: Record<string, number> = {};
    const finishedAt: Record<string, number> = {};
    const begin = Date.now();

    await inferMissingSkills(nodes, async (title) => {
      startedAt[title] = Date.now() - begin;
      await sleep(title === 'Slow' ? SLOW_MS : 5);
      finishedAt[title] = Date.now() - begin;
      return [1];
    });

    const elapsed = Date.now() - begin;

    // Sequentially this would be 300 + 3×5 ≈ 315ms and every fast node would
    // finish *after* the slow one; concurrently it is bounded by the slowest.
    expect(elapsed).toBeLessThan(SLOW_MS * 1.5);
    for (const title of ['Fast A', 'Fast B', 'Fast C', 'Fast D']) {
      expect(startedAt[title]).toBeLessThan(SLOW_MS / 2);
      expect(finishedAt[title]).toBeLessThan(finishedAt['Slow']!);
    }
  });

  it('a slow node that eventually FAILS still does not lose its siblings', async () => {
    const tree = node('Slow and doomed', [], [node('Fast')]);
    const nodes = collectNodesNeedingSkills(tree);

    const failures = await inferMissingSkills(nodes, async (title) => {
      if (title === 'Fast') return [2];
      await sleep(100);
      throw new Error('timed out after 100ms');
    });

    expect(tree.subtasks[0]!.skillIds).toEqual([2]);
    expect(failures.map((f) => f.title)).toEqual(['Slow and doomed']);
    expect(failures[0]!.reason).toBe('timed out after 100ms');
  });

  it('treats an empty classification as a failure, leaving skills empty', async () => {
    const tree = node('Unclassifiable');
    const failures = await inferMissingSkills(collectNodesNeedingSkills(tree), async () => []);

    expect(tree.skillIds).toEqual([]);
    expect(failures[0]!.reason).toBe('no skills returned');
  });

  it('does not call the LLM at all when nothing needs skills', async () => {
    const infer = vi.fn();

    await expect(inferMissingSkills([], infer)).resolves.toEqual([]);
    expect(infer).not.toHaveBeenCalled();
  });

  it('never throws, whatever the inference function does', async () => {
    const tree = node('Root', [], [node('Child')]);

    await expect(
      inferMissingSkills(collectNodesNeedingSkills(tree), async () => {
        throw new Error('everything is down');
      }),
    ).resolves.toHaveLength(2);
  });
});
