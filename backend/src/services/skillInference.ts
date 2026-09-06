import type { SkillInference } from '../llm/inferSkills.js';
import type { CreateTaskRequest } from '../schemas/task.js';
import type { TaskNode } from '../types/task.js';

/**
 * Skill inference for a whole `POST /tasks` tree (REQ-6.1, REQ-6.2, REQ-6.3).
 *
 * Split from the LLM client so the concurrency and tree-walking rules can be
 * tested without a network: the caller injects how a single title is
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
 * What inference did to one node, reported for every node it was asked about.
 *
 * `classified` means the LLM chose skills — reported because a populated
 * `skills` array otherwise can't say whether the user or the LLM chose it
 * (REQ-4.8, REQ-6.9). `failed` is an error (REQ-6.6); `unclassifiable` means
 * the model correctly found the title isn't a software task (REQ-6.8), so it
 * must not be presented as an error.
 *
 * `node` is the original request node, used to match outcomes back to it.
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
 * Every node in the tree whose `skillIds` is empty (REQ-6.1). Walks the whole
 * tree, not just the root: each subtask is classified from its own title,
 * standalone (assumption 7).
 *
 * Returned depth-first, the same order `insertTaskTree` writes rows in, so
 * outcomes can be matched back to response nodes positionally.
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
 * straight onto each node's `skillIds` so the existing insert path persists
 * them with no knowledge that an LLM was involved (REQ-6.2). Mutation is safe
 * here: these are the freshly parsed request nodes, owned by this request.
 *
 * Uses `Promise.allSettled`, not `Promise.all`, so one failing node doesn't
 * abandon its siblings' results — every node gets its own outcome. This also
 * bounds cost: the calls are independent, so concurrency beats one round trip
 * per node, and one slow node delays only itself.
 *
 * Never throws. Callers get every outcome back as data, in node order.
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
      // Task is still created with skillIds: [] (REQ-6.4); reason is for
      // logging and flagging.
      outcomes.push({
        kind: 'failed',
        node,
        title: node.title,
        reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      return;
    }

    if (!result.value.classifiable) {
      // Not an error: the title just isn't a software task (REQ-6.8).
      outcomes.push({ kind: 'unclassifiable', node, title: node.title });
      return;
    }

    if (result.value.skillIds.length === 0) {
      // Unreachable via `parseSkillInference` (it throws instead), but kept
      // since `InferSkillsFn` is injected — another implementation could
      // return this.
      outcomes.push({ kind: 'failed', node, title: node.title, reason: 'no skills returned' });
      return;
    }

    node.skillIds = result.value.skillIds;
    outcomes.push({ kind: 'classified', node, title: node.title });
  });

  return outcomes;
}

/** The response-only marker each outcome kind sets. */
const MARKER = {
  classified: 'skillInferenceApplied',
  failed: 'skillInferenceFailed',
  unclassifiable: 'skillInferenceUnclassifiable',
} as const;

const REASON_LOG_LIMIT = 300;

/**
 * Bounds `reason` before it goes into the response body. The LLM client
 * already truncates its own messages for logging, but that cap (200 chars,
 * design §5.2) is tuned for a one-line server log, not a client payload;
 * this is a second, generous backstop so a future error path can't send an
 * unbounded string to the browser. The frontend still truncates further for
 * toast display — this limit is about payload size, not readability.
 */
function boundedReason(reason: string): string {
  return reason.length > REASON_LOG_LIMIT ? `${reason.slice(0, REASON_LOG_LIMIT)}…` : reason;
}

/**
 * Copies the outcomes onto the response tree as `skillInferenceApplied`,
 * `skillInferenceFailed` or `skillInferenceUnclassifiable` (REQ-6.6, REQ-6.8,
 * REQ-6.9).
 *
 * Response-only: these flags describe this one request, not the task, so
 * they're never stored or returned by a `GET`. Without them the frontend
 * couldn't distinguish an LLM-tried-and-failed empty `skills` from a
 * not-a-task empty `skills`, nor an LLM-chosen `skills` from a user-chosen one.
 *
 * The two trees are walked in lockstep: `insertTaskTree` writes depth-first
 * and the read path orders by id, so `response.subtasks[i]` is always the row
 * created from `request.subtasks[i]`. Matching by title would misfire on
 * duplicate subtask names.
 */
export function markInferenceOutcomes(
  request: CreateTaskRequest,
  response: TaskNode,
  outcomes: InferenceOutcome[],
): void {
  if (outcomes.length === 0) {
    return;
  }

  // A node appears in `outcomes` at most once, so one lookup suffices.
  const markerByNode = new Map(outcomes.map((outcome) => [outcome.node, MARKER[outcome.kind]]));
  const reasonByNode = new Map(
    outcomes
      .filter((outcome): outcome is Extract<InferenceOutcome, { kind: 'failed' }> =>
        outcome.kind === 'failed',
      )
      .map((outcome) => [outcome.node, outcome.reason]),
  );

  const visit = (requestNode: CreateTaskRequest, responseNode: TaskNode) => {
    const marker = markerByNode.get(requestNode);
    if (marker !== undefined) {
      responseNode[marker] = true;
    }
    const reason = reasonByNode.get(requestNode);
    if (reason !== undefined) {
      responseNode.skillInferenceFailureReason = boundedReason(reason);
    }

    const pairs = Math.min(requestNode.subtasks.length, responseNode.subtasks.length);
    for (let i = 0; i < pairs; i += 1) {
      visit(requestNode.subtasks[i]!, responseNode.subtasks[i]!);
    }
  };

  visit(request, response);
}
