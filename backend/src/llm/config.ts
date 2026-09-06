/**
 * Typed LLM configuration (design §5.1, REQ-6.7).
 *
 * Every `LLM_*` variable is read **once**, at module load, into one frozen
 * object, rather than re-reading `process.env` at each call site.
 *
 * Nothing here throws. A missing `LLM_API_KEY` must not stop the backend
 * booting (REQ-6.7) — inference attempts simply fail and fall back per
 * REQ-6.4.
 */

/** `live` calls Gemini; `stub` and `fail` are the test doubles from design §5.4. */
export type LlmMode = 'live' | 'stub' | 'fail';

export interface LlmConfig {
  /** Gemini API origin, no trailing slash. */
  baseUrl: string;
  /** Model id, e.g. `gemini-3.8-flash`. */
  model: string;
  /** Per-call deadline in milliseconds; the client aborts the request at this point. */
  timeoutMs: number;
  mode: LlmMode;
  /**
   * `null` when unset — deliberately not `''`, so "no key supplied" is a
   * distinct, checkable state rather than a falsy string that reads as a value.
   */
  apiKey: string | null;
}

const LLM_MODES: readonly LlmMode[] = ['live', 'stub', 'fail'];

const DEFAULTS = {
  baseUrl: 'https://generativelanguage.googleapis.com',
  model: 'gemini-3.8-flash',
  timeoutMs: 10_000,
  mode: 'live' as LlmMode,
};

function isLlmMode(value: string): value is LlmMode {
  return (LLM_MODES as readonly string[]).includes(value);
}

/**
 * A non-empty, trimmed value, or `undefined`. Blank must be treated like
 * absent, since Compose can pass unset variables through as empty strings.
 */
function readString(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Builds the config from an environment-like object. Takes `env` as a
 * parameter so unit tests can exercise the defaulting rules without mutating
 * the real `process.env`.
 *
 * Unusable values fall back to the committed default with a warning rather
 * than throwing — a typo in `LLM_MODE` should degrade gracefully, not
 * prevent boot.
 */
export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const rawMode = readString(env.LLM_MODE);
  let mode = DEFAULTS.mode;
  if (rawMode !== undefined) {
    if (isLlmMode(rawMode)) {
      mode = rawMode;
    } else {
      console.warn(`llm: ignoring unknown LLM_MODE "${rawMode}", using "${DEFAULTS.mode}"`);
    }
  }

  const rawTimeout = readString(env.LLM_TIMEOUT_MS);
  let timeoutMs = DEFAULTS.timeoutMs;
  if (rawTimeout !== undefined) {
    const parsed = Number(rawTimeout);
    if (Number.isFinite(parsed) && parsed > 0) {
      timeoutMs = parsed;
    } else {
      console.warn(
        `llm: ignoring invalid LLM_TIMEOUT_MS "${rawTimeout}", using ${DEFAULTS.timeoutMs}`,
      );
    }
  }

  return Object.freeze({
    baseUrl: (readString(env.LLM_BASE_URL) ?? DEFAULTS.baseUrl).replace(/\/+$/, ''),
    model: readString(env.LLM_MODEL) ?? DEFAULTS.model,
    timeoutMs,
    mode,
    apiKey: readString(env.LLM_API_KEY) ?? null,
  });
}

/**
 * One-line summary for the startup log. The key itself is never logged, only
 * whether one is present (REQ-6.7).
 */
export function describeLlmConfig(config: LlmConfig): string {
  return `llm: mode=${config.mode} model=${config.model} baseUrl=${config.baseUrl} timeoutMs=${config.timeoutMs} apiKey=${config.apiKey ? 'set' : 'missing'}`;
}

/** The process-wide config, read once at startup. */
export const llmConfig: LlmConfig = loadLlmConfig();
