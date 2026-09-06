import type { CreateTaskInput } from '../types';

/**
 * One node of the Task Creation Page's draft tree. Mirrors the `POST /tasks`
 * body shape so submitting is a direct serialization with no transformation,
 * plus one client-only field.
 */
export interface DraftNode {
  /**
   * A stable React `key` for a node the server has not seen yet, so it has no
   * real `id`. Using the array index instead would remount the wrong inputs
   * when a subtask is inserted above another. Stripped before sending.
   */
  localId: string;
  title: string;
  skillIds: number[];
  subtasks: DraftNode[];
}

let fallbackId = 0;

/**
 * `crypto.randomUUID` is only defined in a secure context. Compose serves the
 * SPA on `http://localhost:3000`, which qualifies, but a reviewer opening it
 * over a LAN address would otherwise hit `undefined is not a function` on the
 * very first render — the counter keeps ids unique within the one page load,
 * which is all a `key` needs.
 */
function newLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  fallbackId += 1;
  return `local-${fallbackId}`;
}

/** A blank node — what "Add Subtask" appends, and what the page starts with. */
export function emptyNode(): DraftNode {
  return { localId: newLocalId(), title: '', skillIds: [], subtasks: [] };
}

/**
 * Appends a blank subtask to the node with `targetId`, wherever it sits in
 * the tree. Immutable throughout: every node on the path back to the root is
 * rebuilt, so React sees new object identities and re-renders, while
 * untouched branches keep theirs and don't.
 */
export function addSubtaskTo(node: DraftNode, targetId: string): DraftNode {
  if (node.localId === targetId) {
    return { ...node, subtasks: [...node.subtasks, emptyNode()] };
  }
  return { ...node, subtasks: node.subtasks.map((child) => addSubtaskTo(child, targetId)) };
}

/**
 * Replaces one direct child by `localId`, returning a new parent. Used by
 * `TaskFormNode` to lift a child's edit one level up: each level rebuilds
 * only itself, and the change propagates to the page's state one hop at a
 * time.
 */
export function replaceChild(node: DraftNode, updated: DraftNode): DraftNode {
  return {
    ...node,
    subtasks: node.subtasks.map((child) => (child.localId === updated.localId ? updated : child)),
  };
}

/**
 * Strips `localId` from the whole tree, leaving exactly the recursive
 * `POST /tasks` body. Titles are trimmed because the server's Zod schema
 * trims too — sending the raw value would let a title that is only
 * whitespace pass the page's own check and then be rejected by the API.
 */
export function toCreateTaskInput(node: DraftNode): CreateTaskInput {
  return {
    title: node.title.trim(),
    skillIds: node.skillIds,
    subtasks: node.subtasks.map(toCreateTaskInput),
  };
}

/** True when this node and every descendant has a non-blank title. */
export function everyTitleFilled(node: DraftNode): boolean {
  return node.title.trim().length > 0 && node.subtasks.every(everyTitleFilled);
}

/** Total node count, root included — used for the Save button's label. */
export function countNodes(node: DraftNode): number {
  return 1 + node.subtasks.reduce((total, child) => total + countNodes(child), 0);
}
