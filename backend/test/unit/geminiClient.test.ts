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

/**
 * The SDK builds its request headers as a `Headers` instance, so they are
 * normalised before being asserted on.
 */
function headersOf(init: RequestInit): Record<string, string> {
  const { headers } = init;
  return headers instanceof Headers
    ? Object.fromEntries(headers)
    : (headers as Record<string, string>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * These tests stub the network boundary (`fetch`) rather than mocking
 * `@google/genai`. The SDK is therefore exercised for real: the URL, request
 * body and headers asserted below are the ones it actually builds, so this
 * suite would catch the SDK changing the wire format under us — which a module
 * mock, asserting only on the arguments we hand the SDK, could not.
 */
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

  it('tells the model how to decline a title that is not a software task (REQ-6.8)', async () => {
    const fetchMock = vi.fn(async () => geminiOk('{"classifiable":false,"skills":[]}'));
    vi.stubGlobal('fetch', fetchMock);

    await callGemini('buy eggs', config);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const prompt = JSON.parse(init.body as string).contents[0].parts[0].text;

    // The refusal is spelled out as an answer with a shape, not left implicit —
    // and the negative examples are what stop it reading as "reject anything
    // short".
    expect(prompt).toContain('{"classifiable": false, "skills": []}');
    expect(prompt).toContain('"buy eggs" -> {"classifiable":false,"skills":[]}');
    expect(prompt).toContain('"123145" -> {"classifiable":false,"skills":[]}');
    // ...balanced by a terse title that IS a task, so brevity alone is not the
    // signal to decline.
    expect(prompt).toContain('"Fix the login button alignment on Safari"');
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

  it('makes `classifiable` a required, first-generated field (REQ-6.8)', async () => {
    const fetchMock = vi.fn(async () => geminiOk('{"classifiable":true,"skills":["Backend"]}'));
    vi.stubGlobal('fetch', fetchMock);

    await callGemini('Add audit logging', config);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const { responseSchema } = JSON.parse(init.body as string).generationConfig;

    // Required, so the flag cannot be quietly omitted on the titles that need
    // it; ordered first, so the model decides "is this a task" before emitting
    // a skill name it would then have to contradict.
    expect(responseSchema.properties.classifiable.type).toBe('BOOLEAN');
    expect(responseSchema.required).toEqual(['classifiable', 'skills']);
    expect(responseSchema.propertyOrdering).toEqual(['classifiable', 'skills']);
  });

  it('sends the key as a header, never in the URL (REQ-6.7)', async () => {
    const fetchMock = vi.fn(async () => geminiOk('{"classifiable":false,"skills":[]}'));
    vi.stubGlobal('fetch', fetchMock);

    await callGemini('Anything', config);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('test-key');
    expect(headersOf(init)['x-goog-api-key']).toBe('test-key');
  });

  it('returns the candidate text unchanged', async () => {
    vi.stubGlobal('fetch', async () =>
      geminiOk('{"classifiable":true,"skills":["Frontend","Backend"]}'),
    );

    await expect(callGemini('Update profile page', config)).resolves.toBe(
      '{"classifiable":true,"skills":["Frontend","Backend"]}',
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

  it('makes exactly one attempt on a retryable status, leaving the timeout meaningful', async () => {
    // The SDK retries only when `retryOptions` is configured, and the client
    // deliberately does not configure it. Asserted because switching retries on
    // would quietly turn LLM_TIMEOUT_MS from a bound on the whole call into a
    // bound on one attempt of several (design §5.3).
    const fetchMock = vi.fn(async () => new Response('overloaded', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callGemini('Anything', config)).rejects.toThrow('HTTP 503');
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
