import type { SkillInference } from '../llm/inferSkills.js';
import type { CreateTaskRequest } from '../schemas/task.js';
import type { TaskNode } from '../types/task.js';

/**
 * Skill inference for a whole `POST /tasks` tree (design §4.5 steps 2–3,
 * REQ-6.1, REQ-6.2, REQ-6.3).
 *
 * Split from the LLM client so the concurrency and tree-walking rules can be
 * tested without a network or a mode: the caller injects how a single title is
 * classified.
 */

/**
 * Classifies one title. Resolving with `{ classifiable: false }` means the
 * title is not a software task (REQ-6.8); rejecting means inference *failed*
 * for that node (REQ-6.4). The two are different outcomes and are reported
 * separately all the way to the user.
 */
export type InferSkillsFn = (title: string) => Promise<SkillInference>;

/**
 * What inference did to one node — reported for **every** node it was asked
 * about, not only the ones that came out empty.
 *
 * `classified` is the ordinary outcome, and it is reported because the result
 * is otherwise invisible: a populated `skills` array looks the same whether the
 * user chose it or the LLM did, so without this the frontend cannot confirm
 * what inference achieved (REQ-4.8, REQ-6.9).
 *
 * `failed` is an error — the call threw, timed out, or came back unusable — and
 * is what REQ-6.6's `skillInferenceFailed` flag reports. `unclassifiable` is
 * the model working correctly on input that isn't a software task (REQ-6.8);
 * nothing went wrong, so it must not be presented as an error.
 *
 * `node` on every variant is the very node object from the parsed request, used
 * to match it to its row later.
 */
export type InferenceOutcome =
  | { kind: 'classified'; node: CreateTaskRequest; title: string }
  | {
      kind: 'failed';
      node: CreateTaskRequest;
      title: string;
      /** For the server-side log only. */
      reason: string;
    }
  | { kind: 'unclassifiable'; node: CreateTaskRequest; title: string };

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
 * Never throws. Callers get every outcome back as data, one per node, in the
 * order the nodes were given.
 */
export async function inferMissingSkills(
  nodes: CreateTaskRequest[],
  infer: InferSkillsFn,
): Promise<InferenceOutcome[]> {
  if (nodes.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(nodes.map((node) => infer(node.title)));
  const outcomes: InferenceOutcome[] = [];

  settled.forEach((result, index) => {
    const node = nodes[index]!;

    if (result.status === 'rejected') {
      // Left with `skillIds: []` — the task is still created, just with no
      // skills (REQ-6.4). The reason travels back for logging and flagging.
      outcomes.push({
        kind: 'failed',
        node,
        title: node.title,
        reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      return;
    }

    if (!result.value.classifiable) {
      // Nothing went wrong: the title is not a software task (REQ-6.8). Also
      // `skillIds: []`, but reported to the user as information, not an error.
      outcomes.push({ kind: 'unclassifiable', node, title: node.title });
      return;
    }

    if (result.value.skillIds.length === 0) {
      // Unreachable through `parseSkillInference`, which throws rather than
      // returning an empty classification. Kept because `InferSkillsFn` is an
      // injected function: a caller that returned one would otherwise write an
      // empty array over the node and report nothing at all.
      outcomes.push({ kind: 'failed', node, title: node.title, reason: 'no skills returned' });
      return;
    }

    node.skillIds = result.value.skillIds;
    outcomes.push({ kind: 'classified', node, title: node.title });
  });

  return outcomes;
}

/** The response-only marker each outcome kind sets (design §4.1). */
const MARKER = {
  classified: 'skillInferenceApplied',
  failed: 'skillInferenceFailed',
  unclassifiable: 'skillInferenceUnclassifiable',
} as const;

/**
 * Copies the outcomes onto the response tree as `skillInferenceApplied`,
 * `skillInferenceFailed` or `skillInferenceUnclassifiable` (REQ-6.6, REQ-6.8,
 * REQ-6.9, design §4.1).
 *
 * Response-only, by design: the flags describe what happened during this one
 * request, not a property of the task, so they are never stored and never
 * appear in a `GET`. Without them the frontend could not tell "the LLM was
 * tried and couldn't classify this" from "this title isn't a software task" or
 * from "this task simply has no skills" — all three are an empty `skills`
 * array — nor "the LLM chose these skills" from "the user did", which are both
 * a populated one. REQ-4.6/4.7/4.8's notifications key off exactly this.
 *
 * The two trees are walked in lockstep, which is sound because they are the
 * same tree twice: `insertTaskTree` writes depth-first, ids therefore ascend in
 * request order, and the read path orders by id (design §4.4), so
 * `response.subtasks[i]` is the row created from `request.subtasks[i]`.
 * Matching on title instead would mark the wrong node whenever a user gives two
 * subtasks the same name.
 */
export function markInferenceOutcomes(
  request: CreateTaskRequest,
  response: TaskNode,
  outcomes: InferenceOutcome[],
): void {
  if (outcomes.length === 0) {
    return;
  }

  // One lookup rather than one set per kind: a node appears in `outcomes` at
  // most once, so the marker it gets is a function of its kind alone.
  const markerByNode = new Map(outcomes.map((outcome) => [outcome.node, MARKER[outcome.kind]]));

  const visit = (requestNode: CreateTaskRequest, responseNode: TaskNode) => {
    const marker = markerByNode.get(requestNode);
    if (marker !== undefined) {
      responseNode[marker] = true;
    }

    const pairs = Math.min(requestNode.subtasks.length, responseNode.subtasks.length);
    for (let i = 0; i < pairs; i += 1) {
      visit(requestNode.subtasks[i]!, responseNode.subtasks[i]!);
    }
  };

  visit(request, response);
}
