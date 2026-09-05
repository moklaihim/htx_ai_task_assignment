import type { CreateTaskRequest } from '../schemas/task.js';

/**
 * Skill inference for a whole `POST /tasks` tree (design §4.5 steps 2–3,
 * REQ-6.1, REQ-6.2, REQ-6.3).
 *
 * Split from the LLM client so the concurrency and tree-walking rules can be
 * tested without a network or a mode: the caller injects how a single title is
 * classified.
 */

/** Classifies one title. Rejecting means inference failed for that node. */
export type InferSkillsFn = (title: string) => Promise<number[]>;

/** One node whose inference rejected, with the reason for the server-side log. */
export interface InferenceFailure {
  /** The very node object from the parsed request, used to match it to its row later. */
  node: CreateTaskRequest;
  title: string;
  reason: string;
}

/**
 * Every node in the tree whose `skillIds` is empty — the trigger for inference
 * (REQ-6.1, design §4.1).
 *
 * The whole tree, not just the root: a subtask created without skills is
 * classified from **its own** title, standalone (assumption 7), so a
 * root-only walk would leave every unskilled subtask permanently unclassified.
 * Returned in depth-first order, the same order `insertTaskTree` writes rows
 * in, which is what lets failures be matched back to response nodes positionally.
 */
export function collectNodesNeedingSkills(root: CreateTaskRequest): CreateTaskRequest[] {
  const nodes: CreateTaskRequest[] = [];

  const visit = (node: CreateTaskRequest) => {
    if (node.skillIds.length === 0) {
      nodes.push(node);
    }
    for (const child of node.subtasks) {
      visit(child);
    }
  };

  visit(root);
  return nodes;
}

/**
 * Infers skills for the given nodes **concurrently**, writing successful ids
 * straight onto each node's `skillIds` so the existing insert path (design
 * §4.5) persists them with no knowledge that an LLM was involved (REQ-6.2).
 * Mutation is safe here: these objects are the freshly parsed request body,
 * owned by this one request and discarded with it.
 *
 * `Promise.allSettled`, not `Promise.all`, is the point of this function
 * (design §5.3): `all` rejects the instant any node fails and abandons the
 * results of its siblings, which would turn one unlucky node into a
 * tree-wide loss of inference. `allSettled` waits for every node and reports
 * each outcome separately, so a five-node tree where one call fails still
 * gets four classified nodes.
 *
 * Concurrency also bounds the cost: the calls are independent, so a tree with
 * five unskilled nodes takes roughly one round trip rather than five
 * (design §5.2), and one slow node delays only itself.
 *
 * Never throws. Callers get the failures back as data.
 */
export async function inferMissingSkills(
  nodes: CreateTaskRequest[],
  infer: InferSkillsFn,
): Promise<InferenceFailure[]> {
  if (nodes.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(nodes.map((node) => infer(node.title)));
  const failures: InferenceFailure[] = [];

  settled.forEach((outcome, index) => {
    const node = nodes[index]!;

    if (outcome.status === 'fulfilled' && outcome.value.length > 0) {
      node.skillIds = outcome.value;
      return;
    }

    // Left with `skillIds: []` — the task is still created, just with no
    // skills (REQ-6.4). The reason travels back for logging and flagging.
    failures.push({
      node,
      title: node.title,
      reason:
        outcome.status === 'rejected'
          ? outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason)
          : 'no skills returned',
    });
  });

  return failures;
}
