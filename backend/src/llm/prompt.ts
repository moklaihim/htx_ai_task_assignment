/**
 * The classification prompt (design §5.2, REQ-6.5, REQ-6.8).
 *
 * Kept in its own module so the exact text is one reviewable artifact, and
 * the unit tests can assert against it directly.
 */

/**
 * The fixed skill set (REQ-6.5). A constant rather than something read from
 * the `skills` table, since it is also the `enum` the model's response schema
 * is constrained to. Names that come back are still mapped against the
 * seeded rows before anything is written (design §5.2).
 */
export const VALID_SKILL_NAMES = ['Frontend', 'Backend'] as const;

/**
 * One few-shot example. `classifiable: false` examples carry no skills —
 * they cover REQ-6.8: the title is free text, so "buy eggs" and "123145" are
 * ordinary inputs that must not get an invented classification.
 */
interface PromptExample {
  title: string;
  classifiable: boolean;
  skills: string[];
}

/**
 * Few-shot guidance, in three groups:
 * 1. The three reference examples from REQ-6.5.
 * 2. One terse but real task title, so short titles aren't rejected as
 *    non-tasks.
 * 3. Three non-tasks: an errand, digits, and keyboard mash.
 */
const EXAMPLES: readonly PromptExample[] = [
  {
    title:
      'As a visitor, I want to see a responsive homepage so that I can easily navigate on both desktop and mobile devices.',
    classifiable: true,
    skills: ['Frontend'],
  },
  {
    title:
      'As a system administrator, I want audit logs of all data access and modifications so that I can ensure compliance with data protection regulations and investigate any security incidents.',
    classifiable: true,
    skills: ['Backend'],
  },
  {
    title:
      'As a logged-in user, I want to update my profile information and upload a profile picture so that my account details are accurate and personalized.',
    classifiable: true,
    skills: ['Frontend', 'Backend'],
  },
  {
    title: 'Fix the login button alignment on Safari',
    classifiable: true,
    skills: ['Frontend'],
  },
  { title: 'buy eggs', classifiable: false, skills: [] },
  { title: '123145', classifiable: false, skills: [] },
  { title: 'asdkjhasdkjh', classifiable: false, skills: [] },
];

/**
 * Builds the prompt for one task title (design §5.2). One call per node, from
 * that node's **own** title only — no parent or sibling context (assumption
 * 7), so a subtask is classified on its own merits.
 *
 * The prompt asks two questions in a fixed order — *is* this a software task,
 * and only then *which* skills does it need — since the title is a free-text
 * field (REQ-6.8) and the model needs somewhere to say "neither".
 */
export function buildPrompt(title: string): string {
  const examples = EXAMPLES.map(
    (example) =>
      `"${example.title}" -> ${JSON.stringify({
        classifiable: example.classifiable,
        skills: example.skills,
      })}`,
  ).join('\n');

  return [
    'You classify software task descriptions by the skills required to implement them.',
    '',
    `Valid skills: ${VALID_SKILL_NAMES.join(', ')}`,
    '- Frontend: user-facing work — UI, layout, styling, client-side behaviour in a browser or app.',
    '- Backend: server-side work — APIs, business logic, databases, jobs, auth, infrastructure.',
    '',
    'Answer two questions, in this order.',
    '',
    '1. Is this text a software task at all? A software task describes work to build,',
    '   change, fix, or operate software: a user story, a feature, a bug, a chore. It',
    '   need not be long or well written — a terse title is still a task. It is NOT a',
    '   software task if it is a personal errand, a shopping item, an unrelated note,',
    '   a question, random digits, or gibberish.',
    '   If it is not a software task, or you cannot tell what software work it asks',
    '   for, answer {"classifiable": false, "skills": []} and stop. Do not guess a',
    '   skill for such text — answering "Frontend" or "Backend" for it is wrong.',
    '',
    '2. Only if it IS a software task, choose the skills it requires. Return one or',
    '   both, never an empty list, with "classifiable": true.',
    '',
    'Examples:',
    examples,
    '',
    `Task: "${title}"`,
  ].join('\n');
}
