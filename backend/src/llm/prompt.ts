/**
 * The classification prompt (design §5.2, REQ-6.5, REQ-6.8).
 *
 * Kept in its own module so the exact text is one reviewable artifact rather
 * than a template literal buried in the HTTP client — the prompt is the part
 * of this feature most likely to be iterated on, and the unit tests assert
 * against it directly.
 */

/**
 * The fixed skill set (REQ-6.5). Deliberately a constant rather than something
 * read from the `skills` table: it is also the `enum` the model's response
 * schema is constrained to, and the few-shot examples below are written in
 * terms of these two names. Names that come back are still mapped against the
 * seeded rows before anything is written (design §5.2).
 */
export const VALID_SKILL_NAMES = ['Frontend', 'Backend'] as const;

/**
 * One few-shot example. `classifiable: false` examples carry no skills — they
 * are the whole point of REQ-6.8: the title is free text, so "buy eggs" and
 * "123145" are ordinary inputs, and a model given only positive examples will
 * dutifully invent a classification for them.
 */
interface PromptExample {
  title: string;
  classifiable: boolean;
  skills: string[];
}

/**
 * Few-shot guidance, in three groups.
 *
 * 1. The three PDF Part 5.1 examples — the same titles REQ-6.5 lists as the
 *    reference cases, so the prompt is tuned on exactly what it is manually
 *    verified against (task 6.9).
 * 2. One terse but real task title. Without it, the "reject non-tasks" rule
 *    below reads as "reject anything short", and genuine titles like
 *    "Fix the login button alignment" start coming back unclassifiable — a
 *    false negative is just as wrong as the hallucination it replaced.
 * 3. Three non-tasks: an errand, digits, and keyboard mash. Together they
 *    cover the three ways free text arrives with no software work in it —
 *    meaningful-but-unrelated, structured-but-meaningless, and meaningless.
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
 * that node's **own** title only — no parent or sibling context (assumption 7),
 * which is what makes a subtask classified on its own merits rather than
 * inheriting its parent's skills.
 *
 * The prompt asks two questions in a fixed order — *is* this a software task,
 * and only then *which* skills does it need — because the title is a free-text
 * field (REQ-6.8). A prompt that asks only the second question offers no way to
 * answer "neither", so the model picks a skill for "buy eggs" rather than
 * declining; the `classifiable` flag gives it somewhere to put that answer, and
 * the response schema (design §5.2) makes the flag mandatory rather than
 * optional prose. `classifiable` is asked first, and generated first, so the
 * decision is made before any skill has been committed to.
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
    'Return only JSON: {"classifiable": true, "skills": ["Frontend"]}',
    '',
    'Examples:',
    examples,
    '',
    `Task: "${title}"`,
  ].join('\n');
}
