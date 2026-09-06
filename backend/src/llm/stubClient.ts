/**
 * The `stub` half of `LLM_MODE` (design §5.4).
 *
 * Deterministic keyword classification, no network, no API key, no quota. It
 * exists so the integration and e2e suites can cover the *success* path of
 * skill inference without depending on an external service (REQ-0.9).
 *
 * It returns the same thing `callGemini` returns — raw JSON text — rather
 * than ids, so both modes flow through the identical `parseSkillInference`
 * gate.
 */

const FRONTEND_KEYWORDS = [
  'ui',
  'ux',
  'css',
  'html',
  'page',
  'homepage',
  'screen',
  'layout',
  'responsive',
  'button',
  'form',
  'modal',
  'navigation',
  'navigate',
  'mobile',
  'browser',
  'render',
  'style',
  'component',
  'dashboard',
  'upload a profile picture',
];

const BACKEND_KEYWORDS = [
  'api',
  'endpoint',
  'server',
  'database',
  'sql',
  'query',
  'queries',
  'schema',
  'migration',
  'cache',
  'queue',
  'auth',
  'token',
  'session',
  'audit',
  'log',
  'permission',
  'validation',
  'job',
  'webhook',
  'storage',
];

function matches(haystack: string, keywords: RegExp[]): boolean {
  return keywords.some((keyword) => keyword.test(haystack));
}

/**
 * Word-boundary matching, with an optional plural suffix, rather than a plain
 * `includes`: a substring test would make "log" match "login" and "api" match
 * "rapid".
 */
function toMatchers(keywords: string[]): RegExp[] {
  return keywords.map((keyword) => new RegExp(`\\b${keyword}(?:s|es)?\\b`));
}

const FRONTEND_MATCHERS = toMatchers(FRONTEND_KEYWORDS);
const BACKEND_MATCHERS = toMatchers(BACKEND_KEYWORDS);

/**
 * Classifies `title` by keyword and returns it in Gemini's response format.
 *
 * A title matching both keyword sets (or neither side exclusively) gets both
 * skills. A title matching **no** keyword at all comes back
 * `{"classifiable": false, "skills": []}` — the stub's stand-in for REQ-6.8's
 * "this isn't a software task I can classify".
 */
export async function callStub(title: string): Promise<string> {
  const haystack = title.toLowerCase();
  const frontend = matches(haystack, FRONTEND_MATCHERS);
  const backend = matches(haystack, BACKEND_MATCHERS);

  if (!frontend && !backend) {
    return JSON.stringify({ classifiable: false, skills: [] });
  }

  const skills = frontend && !backend ? ['Frontend'] : backend && !frontend ? ['Backend'] : ['Frontend', 'Backend'];

  return JSON.stringify({ classifiable: true, skills });
}
