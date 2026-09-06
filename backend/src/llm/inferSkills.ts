import { llmConfig, type LlmConfig } from './config.js';
import { callGemini } from './geminiClient.js';
import { parseSkillInference, type SkillInference } from './parseSkills.js';
import { callStub } from './stubClient.js';
import type { Skill } from '../types/task.js';

export type { SkillInference } from './parseSkills.js';

/**
 * The single entry point the rest of the backend uses for skill inference
 * (REQ-6.1). Callers pass a title and the seeded skills and get back one of
 * the two successful outcomes — seeded skill ids, or "not classifiable"
 * (REQ-6.8) — or an exception. They never see which `LLM_MODE` produced it.
 *
 * The three modes (design §5.4) differ **only** in where the raw response
 * text comes from; parsing, the unrecognised-name gate, and the failure
 * semantics are shared, so a test passing under `stub` says something about
 * `live`.
 *
 * Selected by configuration alone — no argument, header, or request field can
 * change the mode.
 */
export async function inferSkills(
  title: string,
  seededSkills: Skill[],
  config: LlmConfig = llmConfig,
): Promise<SkillInference> {
  const rawText = await callByMode(title, config);
  return parseSkillInference(rawText, seededSkills);
}

function callByMode(title: string, config: LlmConfig): Promise<string> {
  switch (config.mode) {
    case 'stub':
      return callStub(title);
    case 'fail':
      // Always throws, so the REQ-6.4 fallback path can be exercised
      // deterministically (design §5.4).
      return Promise.reject(new Error('LLM_MODE=fail'));
    case 'live':
      return callGemini(title, config);
  }
}
