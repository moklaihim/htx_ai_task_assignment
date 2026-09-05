import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TaskNode } from '../../src/types/task.js';

// `live` mode with no key at all — the state a reviewer who never edits `.env`
// lands in (REQ-6.7). Set before the app graph is imported; see the note in
// tasksLlmStub.test.ts.
process.env.LLM_MODE = 'live';
delete process.env.LLM_API_KEY;

const { startTestServer } = await import('../helpers/testServer.js');
type TestServer = Awaited<ReturnType<typeof startTestServer>>;

/**
 * 6.8 — the app with `LLM_API_KEY` removed entirely (REQ-6.4, REQ-6.7).
 *
 * The backend must run and behave exactly as the failure case rather than
 * refusing to boot, so a forgotten key costs a reviewer a toast, not a
 * container that won't start (design §5.1).
 */
describe('POST /tasks with no LLM_API_KEY (6.8, REQ-6.7, REQ-6.4)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  it('boots and serves requests with no key configured', async () => {
    const { llmConfig } = await import('../../src/llm/config.js');
    expect(llmConfig.apiKey).toBeNull();
    expect(llmConfig.mode).toBe('live');

    const res = await fetch(`${server.baseUrl}/health`);
    expect(res.status).toBe(200);
  });

  it('creates the task with empty skills and the failure flag, without a network call', async () => {
    // If the client tried to reach Gemini despite having no key, this spy
    // would record it — the point being that the missing key is detected
    // before any request is made (design §5.3).
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await fetch(`${server.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Created without an API key' }),
    });
    const task = (await res.json()) as TaskNode;

    expect(res.status).toBe(201);
    expect(task.skills).toEqual([]);
    expect(task.skillInferenceFailed).toBe(true);

    const outboundCalls = fetchSpy.mock.calls.filter(
      ([input]) => !String(input).startsWith(server.baseUrl),
    );
    expect(outboundCalls).toEqual([]);
    fetchSpy.mockRestore();
  });
});
