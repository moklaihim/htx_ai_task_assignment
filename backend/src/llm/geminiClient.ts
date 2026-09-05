import { llmConfig, type LlmConfig } from './config.js';
import { buildPrompt, VALID_SKILL_NAMES } from './prompt.js';

/**
 * Gemini `generateContent` client (design §5.2). One title in, the model's raw
 * JSON text out — mapping that text onto seeded skill ids is a separate
 * concern (`parseSkillNames`, task 6.3), so this module owns the HTTP call and
 * nothing else.
 *
 * Every failure path throws. Callers treat *any* throw as "inference failed
 * for this node" (design §5.3) and fall back to no skills, so the message
 * exists to be logged, not to be branched on.
 */

/**
 * Structured output (design §5.2): `responseMimeType: application/json` plus a
 * response schema whose `enum` is the fixed skill set. Constraining the model
 * at the source removes most parsing failures before they can happen — without
 * it, a chatty ```json ...``` fence or a "Sure! Here are the skills" preamble
 * would be a perfectly ordinary response that the parser would then have to
 * reject.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    skills: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: [...VALID_SKILL_NAMES] },
    },
  },
  required: ['skills'],
} as const;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Calls Gemini for one task title and returns the raw response text (expected
 * to be `{"skills":[...]}`).
 *
 * `temperature: 0` because classification wants the model's most likely answer
 * every time, not variety — two identical titles should not get different
 * skills.
 *
 * The timeout comes from config (`LLM_TIMEOUT_MS`) and is enforced with an
 * `AbortController`, not just awaited: `fetch` has no default deadline, so
 * without this a hung connection would keep the whole `POST /tasks` request
 * waiting indefinitely. `clearTimeout` in `finally` stops a pending timer from
 * holding the event loop open after a fast response.
 */
export async function callGemini(title: string, config: LlmConfig = llmConfig): Promise<string> {
  if (!config.apiKey) {
    // Checked before the request so the reason logged is the real one (design
    // §5.3) rather than a downstream 400 about a malformed credential.
    throw new Error('LLM_API_KEY is not set');
  }

  const url = `${config.baseUrl}/v1beta/models/${config.model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Header rather than a `?key=` query parameter: a URL ends up in
        // access logs and error messages, and the key must not (REQ-6.7).
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(title) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`timed out after ${config.timeoutMs}ms`);
    }
    throw new Error(`request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // The body often carries Gemini's own explanation (bad key, quota
    // exhausted, model not found); truncated because it is going into a log
    // line, not a response.
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  const body = (await response.json().catch(() => null)) as GeminiResponse | null;
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('response contained no candidate text');
  }

  return text;
}
