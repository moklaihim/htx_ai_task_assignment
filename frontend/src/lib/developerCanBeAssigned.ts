/**
 * Mirrors backend/src/services/developerCanBeAssigned.ts exactly — see
 * ../types/task.ts for why this is a hand-kept copy rather than a
 * cross-package import. Used to filter the assignee dropdown to only
 * developers who qualify; the server still re-checks on
 * `PATCH /tasks/:id/assign`, since a filtered dropdown is a convenience,
 * not a guarantee.
 */
export function developerCanBeAssigned(devSkillIds: number[], taskSkillIds: number[]): boolean {
  const owned = new Set(devSkillIds);
  return taskSkillIds.every((id) => owned.has(id));
}
