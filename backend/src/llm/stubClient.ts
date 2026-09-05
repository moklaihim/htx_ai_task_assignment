/**
 * The `stub` half of `LLM_MODE` (design §5.4).
 *
 * Deterministic keyword classification, no network, no API key, no quota. It
 * exists so the integration and e2e suites can cover the *success* path of
 * skill inference without depending on an external service — a test that only
 * ever ran against real Gemini would be slow, flaky, and unrunnable offline or
 * on an exhausted free tier (REQ-0.9).
 *
 * It returns the same thing `callGemini` returns — raw JSON text — rather than
 * ids, so both modes flow through the identical `parseSkillIds` gate. A stub
 * that returned ids directly would bypass the one piece of code that keeps
 * invented skills out of the database, and the tests would then be exercising a
 * path production never takes.
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
 * `includes`: a substring test makes "log" match "login" and "api" match
 * "rapid", which would silently misclassify and — since the stub is what the
 * tests assert against — bake the misclassification into the suite.
 */
function toMatchers(keywords: string[]): RegExp[] {
  return keywords.map((keyword) => new RegExp(`\\b${keyword}(?:s|es)?\\b`));
}

const FRONTEND_MATCHERS = toMatchers(FRONTEND_KEYWORDS);
const BACKEND_MATCHERS = toMatchers(BACKEND_KEYWORDS);

/**
 * Classifies `title` by keyword and returns it in Gemini's response format.
 *
 * A title with no signal either way falls back to **both** skills rather than
 * to none: an empty classification is a failure (design §5.3), and a stub whose
 * job is to exercise the success path must not manufacture failures — `fail`
 * mode is what tests use for those.
 */
export async function callStub(title: string): Promise<string> {
  const haystack = title.toLowerCase();
  const frontend = matches(haystack, FRONTEND_MATCHERS);
  const backend = matches(haystack, BACKEND_MATCHERS);

  const skills =
    frontend && !backend
      ? ['Frontend']
      : backend && !frontend
        ? ['Backend']
        : ['Frontend', 'Backend'];

  return JSON.stringify({ skills });
}
