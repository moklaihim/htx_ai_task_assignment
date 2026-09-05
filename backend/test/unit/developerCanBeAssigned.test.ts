import { describe, expect, it } from 'vitest';
import { developerCanBeAssigned } from '../../src/services/developerCanBeAssigned.js';

// Seeded skill ids (db/seed.sql): Frontend=1, Backend=2.
const FRONTEND = 1;
const BACKEND = 2;

// Seeded developer skills: Bob has only Backend; Carol has both.
const BOB_SKILLS = [BACKEND];
const CAROL_SKILLS = [FRONTEND, BACKEND];

describe('developerCanBeAssigned (design §4.2)', () => {
  // The exact worked-example matrix from design §4.2 — all four rows.
  it.each([
    { taskRequires: '[Backend]', taskSkillIds: [BACKEND], bob: true, carol: true },
    { taskRequires: '[Frontend]', taskSkillIds: [FRONTEND], bob: false, carol: true },
    { taskRequires: '[Frontend, Backend]', taskSkillIds: [FRONTEND, BACKEND], bob: false, carol: true },
    { taskRequires: '[]', taskSkillIds: [], bob: true, carol: true },
  ])('task requires $taskRequires', ({ taskSkillIds, bob, carol }) => {
    expect(developerCanBeAssigned(BOB_SKILLS, taskSkillIds)).toBe(bob);
    expect(developerCanBeAssigned(CAROL_SKILLS, taskSkillIds)).toBe(carol);
  });

  it('a developer with extra skills beyond what the task requires is still allowed', () => {
    expect(developerCanBeAssigned(CAROL_SKILLS, [BACKEND])).toBe(true);
  });
});
