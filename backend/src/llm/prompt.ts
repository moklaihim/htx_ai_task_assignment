/**
 * The classification prompt (design §5.2, REQ-6.5).
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
 * The three PDF Part 5.1 examples, used as few-shot guidance. They are the
 * same titles REQ-6.5 lists as the reference cases, so the prompt is tuned on
 * exactly what it is manually verified against (task 6.9).
 */
const EXAMPLES: ReadonlyArray<{ title: string; skills: string[] }> = [
  {
    title:
      'As a visitor, I want to see a responsive homepage so that I can easily navigate on both desktop and mobile devices.',
    skills: ['Frontend'],
  },
  {
    title:
      'As a system administrator, I want audit logs of all data access and modifications so that I can ensure compliance with data protection regulations and investigate any security incidents.',
    skills: ['Backend'],
  },
  {
    title:
      'As a logged-in user, I want to update my profile information and upload a profile picture so that my account details are accurate and personalized.',
    skills: ['Frontend', 'Backend'],
  },
];

/**
 * Builds the prompt for one task title (design §5.2). One call per node, from
 * that node's **own** title only — no parent or sibling context (assumption 7),
 * which is what makes a subtask classified on its own merits rather than
 * inheriting its parent's skills.
 */
export function buildPrompt(title: string): string {
  const examples = EXAMPLES.map(
    (example) => `"${example.title}" -> ${JSON.stringify({ skills: example.skills })}`,
  ).join('\n');

  return [
    'You classify software task descriptions by the skills required to implement them.',
    '',
    `Valid skills: ${VALID_SKILL_NAMES.join(', ')}`,
    'Return one or both. Return only JSON: {"skills": ["Frontend"]}',
    '',
    'Examples:',
    examples,
    '',
    `Task: "${title}"`,
  ].join('\n');
}
