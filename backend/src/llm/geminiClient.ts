import { ApiError, GoogleGenAI, Type, type Schema } from '@google/genai';
import { llmConfig, type LlmConfig } from './config.js';
import { buildPrompt, VALID_SKILL_NAMES } from './prompt.js';

/**
 * Gemini `generateContent` client (design §5.2). One title in, the model's raw
 * JSON text out — mapping that text onto seeded skill ids is a separate
 * concern (`parseSkillNames`).
 *
 * Uses the official `@google/genai` SDK.
 *
 * Every failure path throws. Callers treat *any* throw as "inference failed
 * for this node" (design §5.3) and fall back to no skills.
 */

/**
 * Structured output (design §5.2): `responseMimeType: application/json` plus a
 * response schema whose `enum` is the fixed skill set, so the model can't
 * return a chatty preamble or a malformed skill name.
 *
 * `classifiable` (REQ-6.8) lets the model flag non-task titles (e.g. "buy
 * eggs") instead of forcing a skill guess; it's **required** so it can't be
 * silently omitted.
 *
 * `propertyOrdering` puts `classifiable` before `skills` so the model commits
 * to "is this a task" before emitting a skill name.
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
 * `baseUrl` stays configurable (`LLM_BASE_URL`) so the endpoint can be pointed
 * at a mock during manual testing. The API key is handed to the SDK, which
 * sends it as an `x-goog-api-key` header rather than a `?key=` query
 * parameter — a URL ends up in access logs and error messages, and the key
 * must not (REQ-6.7).
 *
 * No `retryOptions` are set, so `LLM_TIMEOUT_MS` bounds a single attempt.
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
 * `temperature: 0` because classification wants the model's most likely
 * answer every time, not variety.
 *
 * The timeout comes from config (`LLM_TIMEOUT_MS`) and is enforced with our
 * own `AbortController` so the deadline surfaces as the `timed out after Nms`
 * message design §5.3 documents, rather than whatever the SDK throws.
 */
export async function callGemini(title: string, config: LlmConfig = llmConfig): Promise<string> {
  if (!config.apiKey) {
    // Checked before the client is built so the logged reason is the real one
    // (design §5.3), not a downstream 400 about a malformed credential.
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
    // Thought parts carry the model's reasoning and are marked `thought: true`.
    // They're logged only — `.text` below already excludes them.
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const thought = parts
      .filter((part) => part.thought === true)
      .map((part) => part.text ?? '')
      .join('');
    if (thought) {
      console.log(`llm: thought - ${thought}`);
    }
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
