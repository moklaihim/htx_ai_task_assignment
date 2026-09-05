/**
 * Skill matching (design §4.2, REQ-1.8, REQ-2.4). Assignment is allowed only
 * when the developer's skills are a **superset** of the task's required
 * skills. A task with no required skills accepts anyone: `[].every(...)` is
 * `true`, so the empty case falls out of the rule rather than needing its own
 * branch.
 *
 * Reused unmodified on the frontend to filter the assignee dropdown (REQ-3.3)
 * — the server re-checks regardless, since a filtered dropdown is a
 * convenience, not a guarantee.
 */
export function developerCanBeAssigned(devSkillIds: number[], taskSkillIds: number[]): boolean {
  const owned = new Set(devSkillIds);
  return taskSkillIds.every((id) => owned.has(id));
}
