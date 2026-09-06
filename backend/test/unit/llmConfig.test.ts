import { describe, expect, it } from 'vitest';
import { describeLlmConfig, loadLlmConfig } from '../../src/llm/config.js';

describe('loadLlmConfig (6.1, REQ-6.7)', () => {
  it('falls back to the committed defaults from design §5.1 when nothing is set', () => {
    const config = loadLlmConfig({});

    expect(config).toEqual({
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-3.8-flash',
      timeoutMs: 10_000,
      mode: 'live',
      apiKey: null,
    });
  });

  it('reports a missing key as null rather than throwing, so the backend still boots', () => {
    expect(loadLlmConfig({}).apiKey).toBeNull();
    // Compose forwards an unset variable as an empty string — same thing.
    expect(loadLlmConfig({ LLM_API_KEY: '' }).apiKey).toBeNull();
    expect(loadLlmConfig({ LLM_API_KEY: '   ' }).apiKey).toBeNull();
  });

  it('reads every LLM_* variable when they are set', () => {
    const config = loadLlmConfig({
      LLM_BASE_URL: 'https://example.test/',
      LLM_MODEL: 'gemini-9.9-pro',
      LLM_TIMEOUT_MS: '2500',
      LLM_MODE: 'stub',
      LLM_API_KEY: 'secret-key',
    });

    expect(config).toEqual({
      baseUrl: 'https://example.test',
      model: 'gemini-9.9-pro',
      timeoutMs: 2500,
      mode: 'stub',
      apiKey: 'secret-key',
    });
  });

  it('degrades an unusable LLM_MODE or LLM_TIMEOUT_MS to the default instead of throwing', () => {
    const config = loadLlmConfig({ LLM_MODE: 'lively', LLM_TIMEOUT_MS: 'soon' });

    expect(config.mode).toBe('live');
    expect(config.timeoutMs).toBe(10_000);
  });

  it('never puts the API key in the startup log line', () => {
    const line = describeLlmConfig(loadLlmConfig({ LLM_API_KEY: 'super-secret' }));

    expect(line).not.toContain('super-secret');
    expect(line).toContain('apiKey=set');
    expect(describeLlmConfig(loadLlmConfig({}))).toContain('apiKey=missing');
  });
});
