import { llmConfig, type LlmConfig } from './config.js';
import { callGemini } from './geminiClient.js';
import { parseSkillIds } from './parseSkills.js';
import { callStub } from './stubClient.js';
import type { Skill } from '../types/task.js';

/**
 * The single entry point the rest of the backend uses for skill inference
 * (REQ-6.1). Callers pass a title and the seeded skills and get back seeded
 * skill ids, or an exception — they never see which `LLM_MODE` produced it.
 *
 * The three modes (design §5.4) differ **only** in where the raw response text
 * comes from; parsing, the unrecognised-name gate, and the failure semantics
 * are shared. That is what makes the doubles trustworthy: `stub` runs exactly
 * the production parse path, so a test passing under `stub` says something
 * about `live`.
 *
 * Selected by configuration alone — there is no argument, header, or request
 * field that can change the mode, so no client can talk the backend into using
 * a test double.
 */
export async function inferSkillIds(
  title: string,
  seededSkills: Skill[],
  config: LlmConfig = llmConfig,
): Promise<number[]> {
  const rawText = await callByMode(title, config);
  return parseSkillIds(rawText, seededSkills);
}

function callByMode(title: string, config: LlmConfig): Promise<string> {
  switch (config.mode) {
    case 'stub':
      return callStub(title);
    case 'fail':
      // Always throws, so the REQ-6.4 fallback path can be exercised
      // deterministically without having to break the network (design §5.4).
      return Promise.reject(new Error('LLM_MODE=fail'));
    case 'live':
      return callGemini(title, config);
  }
}
