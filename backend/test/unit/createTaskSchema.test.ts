import { describe, expect, it } from 'vitest';
import { createTaskSchema, formatValidationIssues } from '../../src/schemas/task.js';

/**
 * 5.1 acceptance: the recursive schema rejects a malformed node at *any*
 * depth, not just the root — that is the whole point of `z.lazy` reusing one
 * schema per level rather than validating only the top-level object.
 */
describe('createTaskSchema (5.1, REQ-2.1, REQ-5.1, REQ-5.2)', () => {
  it('accepts a three-level tree and defaults both optional fields to []', () => {
    const parsed = createTaskSchema.safeParse({
      title: 'Parent task',
      skillIds: [1],
      subtasks: [
        { title: 'Child A', subtasks: [{ title: 'Grandchild A1', skillIds: [2] }] },
        { title: 'Child B', skillIds: [] },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data).toEqual({
      title: 'Parent task',
      skillIds: [1],
      subtasks: [
        {
          title: 'Child A',
          skillIds: [],
          subtasks: [{ title: 'Grandchild A1', skillIds: [2], subtasks: [] }],
        },
        { title: 'Child B', skillIds: [], subtasks: [] },
      ],
    });
  });

  it('accepts a bare title, with no skillIds and no subtasks', () => {
    const parsed = createTaskSchema.safeParse({ title: 'Lone task' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ title: 'Lone task', skillIds: [], subtasks: [] });
    }
  });

  it.each([
    ['root', { title: '' }, 'title'],
    ['child', { title: 'Root', subtasks: [{ title: '' }] }, 'subtasks.0.title'],
    [
      'grandchild',
      { title: 'Root', subtasks: [{ title: 'Child', subtasks: [{ title: '' }] }] },
      'subtasks.0.subtasks.0.title',
    ],
    [
      'great-grandchild',
      {
        title: 'Root',
        subtasks: [{ title: 'Child', subtasks: [{ title: 'Grandchild', subtasks: [{ title: '' }] }] }],
      },
      'subtasks.0.subtasks.0.subtasks.0.title',
    ],
  ])('rejects an empty title on a %s, reporting its path', (_level, body, path) => {
    const parsed = createTaskSchema.safeParse(body);

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]!.path.join('.')).toBe(path);
    expect(formatValidationIssues(parsed.error)).toContain(`${path}: title must not be empty`);
  });

  it.each([
    ['root', { title: 'Root', skillIds: [1.5] }, 'skillIds.0'],
    [
      'grandchild',
      { title: 'Root', subtasks: [{ title: 'Child', subtasks: [{ title: 'GC', skillIds: [1.5] }] }] },
      'subtasks.0.subtasks.0.skillIds.0',
    ],
  ])('rejects a non-integer skill id on a %s', (_level, body, path) => {
    const parsed = createTaskSchema.safeParse(body);

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]!.path.join('.')).toBe(path);
  });

  it('rejects a missing title on a nested node', () => {
    const parsed = createTaskSchema.safeParse({
      title: 'Root',
      subtasks: [{ skillIds: [1] }],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]!.path.join('.')).toBe('subtasks.0.title');
  });

  it('rejects a non-array subtasks field', () => {
    const parsed = createTaskSchema.safeParse({ title: 'Root', subtasks: { title: 'Child' } });
    expect(parsed.success).toBe(false);
  });
});
