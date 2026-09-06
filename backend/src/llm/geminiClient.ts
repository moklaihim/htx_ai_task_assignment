import { ApiError, GoogleGenAI, Type, type Schema } from '@google/genai';
import { llmConfig, type LlmConfig } from './config.js';
import { buildPrompt, VALID_SKILL_NAMES } from './prompt.js';

/**
 * Gemini `generateContent` client (design §5.2). One title in, the model's raw
 * JSON text out — mapping that text onto seeded skill ids is a separate
 * concern (`parseSkillNames`, task 6.3), so this module owns the API call and
 * nothing else.
 *
 * Uses the official `@google/genai` SDK rather than a hand-written `fetch`.
 * The SDK owns the two details most likely to drift as the API versions: the
 * request path (`/v1beta/models/{model}:generateContent`) and the shape of the
 * response envelope. Both used to be spelled out in this file, which meant an
 * API version bump was a code change here.
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
 *
 * `classifiable` (REQ-6.8) is the schema's half of the two-question prompt: the
 * title is a free-text field, so "buy eggs" and "123145" are ordinary inputs,
 * and a schema offering only `skills` leaves a model no way to say "neither"
 * except by picking one anyway. Making the flag **required** is what stops it
 * being quietly dropped on the titles that need it most.
 *
 * `propertyOrdering` puts `classifiable` before `skills` in the generated JSON.
 * Generation is left to right, so the model commits to "is this a task" before
 * it has emitted a skill name it would then have to contradict.
 */
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    classifiable: { type: Type.BOOLEAN },
    skills: {
      type: Type.ARRAY,
      items: { type: Type.STRING, enum: [...VALID_SKILL_NAMES] },
    },
  },
  required: ['classifiable', 'skills'],
  propertyOrdering: ['classifiable', 'skills'],
};

/**
 * `baseUrl` stays configurable (`LLM_BASE_URL`) so the endpoint can still be
 * pointed at a mock during manual testing. The key is handed to the SDK, which
 * sends it as an `x-goog-api-key` header rather than a `?key=` query
 * parameter — a URL ends up in access logs and error messages, and the key
 * must not (REQ-6.7).
 *
 * No `retryOptions` are set: the SDK only retries when explicitly configured,
 * so this stays one attempt per call, matching the previous `fetch` behaviour
 * and keeping `LLM_TIMEOUT_MS` a bound on the whole operation rather than on
 * one attempt of several.
 */
function createClient(config: LlmConfig, apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { baseUrl: config.baseUrl },
  });
}

/**
 * Calls Gemini for one task title and returns the raw response text (expected
 * to be `{"classifiable":true,"skills":[...]}`).
 *
 * `temperature: 0` because classification wants the model's most likely answer
 * every time, not variety — two identical titles should not get different
 * skills.
 *
 * The timeout comes from config (`LLM_TIMEOUT_MS`) and is enforced with our own
 * `AbortController` passed as `abortSignal`, rather than the SDK's
 * `httpOptions.timeout`. Both would cut the request off, but owning the
 * controller means we own the resulting error, so the deadline still surfaces
 * as the `timed out after Nms` message design §5.3 documents instead of
 * whatever the SDK happens to throw. `clearTimeout` in `finally` stops a
 * pending timer from holding the event loop open after a fast response.
 */
export async function callGemini(title: string, config: LlmConfig = llmConfig): Promise<string> {
  if (!config.apiKey) {
    // Checked before the client is built so the reason logged is the real one
    // (design §5.3) rather than a downstream 400 about a malformed credential.
    throw new Error('LLM_API_KEY is not set');
  }

  const client = createClient(config, config.apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let text: string | undefined;
  try {
    const response = await client.models.generateContent({
      model: config.model,
      contents: buildPrompt(title),
      config: {
        abortSignal: controller.signal,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
        thinkingConfig: { includeThoughts: true },
      },
    });
    // Thought parts carry the model's reasoning and are marked `thought: true`
    // (as opposed to `"thought" in part`, which is true for every part since
    // the field is merely optional). They're logged only — `.text` below
    // already excludes them from the JSON answer callers parse.
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const thought = parts
      .filter((part) => part.thought === true)
      .map((part) => part.text ?? '')
      .join('');
    if (thought) {
      console.log(`llm: thought - ${thought}`);
    }
    // `.text` concatenates the candidate's text parts, replacing the manual
    // `candidates[0].content.parts[0].text` walk this file used to do.
    text = response.text;
  } catch (err) {
    // Tested before the error itself is inspected: an aborted request can
    // surface as several different error types depending on where it was cut
    // off, but the signal's own state is unambiguous.
    if (controller.signal.aborted) {
      throw new Error(`timed out after ${config.timeoutMs}ms`);
    }
    if (err instanceof ApiError) {
      // The message carries Gemini's own explanation (bad key, quota
      // exhausted, model not found); truncated because it is going into a log
      // line, not a response.
      const detail = err.message.slice(0, 200);
      throw new Error(`HTTP ${err.status}${detail ? `: ${detail}` : ''}`);
    }
    throw new Error(`request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('response contained no candidate text');
  }

  return text;
}
