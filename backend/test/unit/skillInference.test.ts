import { describe, expect, it, vi } from 'vitest';
import {
  collectNodesNeedingSkills,
  inferMissingSkills,
  markInferenceOutcomes,
} from '../../src/services/skillInference.js';
import type { SkillInference } from '../../src/llm/inferSkills.js';
import type { CreateTaskRequest } from '../../src/schemas/task.js';
import type { TaskNode } from '../../src/types/task.js';

/** A parsed `POST /tasks` node, with the schema's defaults already applied. */
function node(
  title: string,
  skillIds: number[] = [],
  subtasks: CreateTaskRequest[] = [],
): CreateTaskRequest {
  return { title, skillIds, subtasks };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A successful classification, as `inferSkills` returns one. */
const classified = (...skillIds: number[]): SkillInference => ({ classifiable: true, skillIds });

/** The REQ-6.8 outcome: the LLM answered, and the title is not a software task. */
const unclassifiable: SkillInference = { classifiable: false };

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

    const outcomes = await inferMissingSkills(nodes, async (title) =>
      title === 'Homepage' ? classified(1) : classified(2),
    );

    expect(tree.skillIds).toEqual([1]);
    expect(tree.subtasks[0]!.skillIds).toEqual([2]);
    // Success is reported too (REQ-6.9) — it is what REQ-4.8's confirmation
    // keys off, and a populated `skills` array alone cannot say who chose it.
    expect(outcomes).toEqual([
      { kind: 'classified', node: tree, title: 'Homepage' },
      { kind: 'classified', node: tree.subtasks[0], title: 'Audit log' },
    ]);
  });

  it('one node failing leaves its siblings classified (Promise.allSettled)', async () => {
    const tree = node('Root', [], [node('Good A'), node('Bad'), node('Good B')]);
    const nodes = collectNodesNeedingSkills(tree);

    const outcomes = await inferMissingSkills(nodes, async (title) => {
      if (title === 'Bad') throw new Error('boom');
      return classified(1);
    });

    const failed = outcomes.filter((outcome) => outcome.kind === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.title).toBe('Bad');
    expect(failed[0]!).toHaveProperty('reason', 'boom');
    // Every sibling still reported as classified, in node order.
    expect(outcomes.map((outcome) => [outcome.kind, outcome.title])).toEqual([
      ['classified', 'Root'],
      ['classified', 'Good A'],
      ['failed', 'Bad'],
      ['classified', 'Good B'],
    ]);
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
      return classified(1);
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

    const outcomes = await inferMissingSkills(nodes, async (title) => {
      if (title === 'Fast') return classified(2);
      await sleep(100);
      throw new Error('timed out after 100ms');
    });

    expect(tree.subtasks[0]!.skillIds).toEqual([2]);
    expect(outcomes.map((outcome) => [outcome.kind, outcome.title])).toEqual([
      ['failed', 'Slow and doomed'],
      ['classified', 'Fast'],
    ]);
    expect(outcomes[0]!).toHaveProperty('reason', 'timed out after 100ms');
  });

  it('reports an unclassifiable title as its own outcome, not as a failure (REQ-6.8)', async () => {
    const tree = node('buy eggs');
    const outcomes = await inferMissingSkills(
      collectNodesNeedingSkills(tree),
      async () => unclassifiable,
    );

    expect(tree.skillIds).toEqual([]);
    expect(outcomes).toEqual([{ kind: 'unclassifiable', node: tree, title: 'buy eggs' }]);
  });

  it('separates all three outcomes within one tree', async () => {
    const tree = node('Root', [], [node('buy eggs'), node('Broken'), node('Style the form')]);
    const outcomes = await inferMissingSkills(collectNodesNeedingSkills(tree), async (title) => {
      if (title === 'buy eggs') return unclassifiable;
      if (title === 'Broken') throw new Error('boom');
      return classified(1);
    });

    expect(outcomes.map((outcome) => [outcome.kind, outcome.title])).toEqual([
      ['classified', 'Root'],
      ['unclassifiable', 'buy eggs'],
      ['failed', 'Broken'],
      ['classified', 'Style the form'],
    ]);
    // Root and the classifiable sibling are unaffected by either problem.
    expect(tree.skillIds).toEqual([1]);
    expect(tree.subtasks[2]!.skillIds).toEqual([1]);
  });

  it('treats a classifiable-but-empty result as a failure, leaving skills empty', async () => {
    const tree = node('Contradictory');
    const outcomes = await inferMissingSkills(collectNodesNeedingSkills(tree), async () =>
      classified(),
    );

    expect(tree.skillIds).toEqual([]);
    expect(outcomes[0]!.kind).toBe('failed');
    expect(outcomes[0]!).toHaveProperty('reason', 'no skills returned');
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

describe('markInferenceOutcomes (6.6, REQ-6.6, REQ-6.8, REQ-6.9)', () => {
  /** A response node as `buildForest` produces it. */
  function responseNode(id: number, title: string, subtasks: TaskNode[] = []): TaskNode {
    return {
      id,
      title,
      status: 'To-do',
      parentTaskId: null,
      assignee: null,
      skills: [],
      subtasks,
    };
  }

  it('flags only the nodes that failed, at any depth', async () => {
    const grandchild = node('Grandchild');
    const tree = node('Root', [], [node('Child A'), node('Child B', [], [grandchild])]);
    const response = responseNode(1, 'Root', [
      responseNode(2, 'Child A'),
      responseNode(3, 'Child B', [responseNode(4, 'Grandchild')]),
    ]);

    const outcomes = await inferMissingSkills(collectNodesNeedingSkills(tree), async (title) => {
      if (title === 'Root' || title === 'Grandchild') throw new Error('boom');
      return classified(1);
    });
    markInferenceOutcomes(tree, response, outcomes);

    expect(response.skillInferenceFailed).toBe(true);
    expect(response.subtasks[0]!.skillInferenceFailed).toBeUndefined();
    expect(response.subtasks[1]!.skillInferenceFailed).toBeUndefined();
    expect(response.subtasks[1]!.subtasks[0]!.skillInferenceFailed).toBe(true);
    // The two that worked carry the success marker instead (REQ-6.9).
    expect(response.subtasks[0]!.skillInferenceApplied).toBe(true);
    expect(response.subtasks[1]!.skillInferenceApplied).toBe(true);
    expect(response.skillInferenceApplied).toBeUndefined();
  });

  it('flags by position, not by title, so duplicate titles do not cross-contaminate', async () => {
    const tree = node('Root', [1], [node('Same'), node('Same')]);
    const response = responseNode(1, 'Root', [responseNode(2, 'Same'), responseNode(3, 'Same')]);

    // Only the *second* "Same" fails.
    const nodes = collectNodesNeedingSkills(tree);
    const outcomes = await inferMissingSkills(nodes, async () => classified());
    outcomes.splice(0, 1);
    markInferenceOutcomes(tree, response, outcomes);

    expect(response.subtasks[0]!.skillInferenceFailed).toBeUndefined();
    expect(response.subtasks[1]!.skillInferenceFailed).toBe(true);
  });

  it('marks an unclassifiable node with its own flag, never the failure one', async () => {
    const tree = node('Root', [], [node('buy eggs')]);
    const response = responseNode(1, 'Root', [responseNode(2, 'buy eggs')]);

    const outcomes = await inferMissingSkills(collectNodesNeedingSkills(tree), async (title) =>
      title === 'buy eggs' ? unclassifiable : classified(1),
    );
    markInferenceOutcomes(tree, response, outcomes);

    const child = response.subtasks[0]!;
    expect(child.skillInferenceUnclassifiable).toBe(true);
    expect(child.skillInferenceFailed).toBeUndefined();
    expect(child.skillInferenceApplied).toBeUndefined();
    expect('skillInferenceUnclassifiable' in response).toBe(false);
  });

  it('marks a classified node so the user can be told what the LLM chose (REQ-6.9)', async () => {
    const tree = node('Root', [1], [node('Style the form')]);
    const response = responseNode(1, 'Root', [responseNode(2, 'Style the form')]);

    const outcomes = await inferMissingSkills(collectNodesNeedingSkills(tree), async () =>
      classified(1),
    );
    markInferenceOutcomes(tree, response, outcomes);

    // Only the node inference actually ran for. The root's skills came from the
    // user, so it carries no marker at all — which is the distinction REQ-4.8's
    // confirmation depends on.
    expect(response.subtasks[0]!.skillInferenceApplied).toBe(true);
    expect('skillInferenceApplied' in response).toBe(false);
  });

  it('leaves every field absent when inference never ran', async () => {
    const tree = node('Root', [1]);
    const response = responseNode(1, 'Root');

    markInferenceOutcomes(tree, response, []);

    expect('skillInferenceFailed' in response).toBe(false);
    expect('skillInferenceUnclassifiable' in response).toBe(false);
    expect('skillInferenceApplied' in response).toBe(false);
  });
});
