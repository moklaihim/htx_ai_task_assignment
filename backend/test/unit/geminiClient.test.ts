import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGemini } from '../../src/llm/geminiClient.js';
import { buildPrompt } from '../../src/llm/prompt.js';
import type { LlmConfig } from '../../src/llm/config.js';

const config: LlmConfig = {
  baseUrl: 'https://llm.test',
  model: 'gemini-2.0-flash',
  timeoutMs: 50,
  mode: 'live',
  apiKey: 'test-key',
};

/** A Gemini success envelope wrapping `text` as the single candidate part. */
function geminiOk(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callGemini (6.2, design §5.2)', () => {
  it('posts the design §5.2 prompt for the given title', async () => {
    const fetchMock = vi.fn(async () => geminiOk('{"skills":["Frontend"]}'));
    vi.stubGlobal('fetch', fetchMock);

    await callGemini('Build a login form', config);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://llm.test/v1beta/models/gemini-2.0-flash:generateContent');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toBe(buildPrompt('Build a login form'));
    expect(prompt).toContain('Valid skills: Frontend, Backend');
    expect(prompt).toContain('Task: "Build a login form"');
    // The three PDF Part 5.1 examples are present as few-shot guidance.
    expect(prompt).toContain('responsive homepage');
    expect(prompt).toContain('audit logs');
    expect(prompt).toContain('profile picture');
  });

  it('requests JSON response mode with the skill set as the schema enum', async () => {
    const fetchMock = vi.fn(async () => geminiOk('{"skills":["Backend"]}'));
    vi.stubGlobal('fetch', fetchMock);

    await callGemini('Add audit logging', config);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const { generationConfig } = JSON.parse(init.body as string);
    expect(generationConfig.responseMimeType).toBe('application/json');
    expect(generationConfig.responseSchema.properties.skills.items.enum).toEqual([
      'Frontend',
      'Backend',
    ]);
    expect(generationConfig.temperature).toBe(0);
  });

  it('sends the key as a header, never in the URL (REQ-6.7)', async () => {
    const fetchMock = vi.fn(async () => geminiOk('{"skills":[]}'));
    vi.stubGlobal('fetch', fetchMock);

    await callGemini('Anything', config);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
  });

  it('returns the candidate text unchanged', async () => {
    vi.stubGlobal('fetch', async () => geminiOk('{"skills":["Frontend","Backend"]}'));

    await expect(callGemini('Update profile page', config)).resolves.toBe(
      '{"skills":["Frontend","Backend"]}',
    );
  });

  it('aborts and throws once LLM_TIMEOUT_MS elapses', async () => {
    // Never resolves on its own — only the client's AbortController can end it.
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );

    const started = Date.now();
    await expect(callGemini('Slow one', config)).rejects.toThrow('timed out after 50ms');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('throws on a non-2xx response, quoting the status', async () => {
    vi.stubGlobal('fetch', async () => new Response('quota exceeded', { status: 429 }));

    await expect(callGemini('Anything', config)).rejects.toThrow('HTTP 429');
  });

  it('throws on a 200 with no candidate text', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"candidates":[]}', { status: 200 }));

    await expect(callGemini('Anything', config)).rejects.toThrow('no candidate text');
  });

  it('throws without calling the network when no key is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(callGemini('Anything', { ...config, apiKey: null })).rejects.toThrow(
      'LLM_API_KEY is not set',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
