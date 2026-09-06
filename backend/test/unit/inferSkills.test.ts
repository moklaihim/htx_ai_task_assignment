import { afterEach, describe, expect, it, vi } from 'vitest';
import { inferSkills } from '../../src/llm/inferSkills.js';
import { loadLlmConfig, type LlmConfig } from '../../src/llm/config.js';
import type { Skill } from '../../src/types/task.js';

const SEEDED: Skill[] = [
  { id: 1, name: 'Frontend' },
  { id: 2, name: 'Backend' },
];

/** Config as it would be loaded from the environment, differing only in LLM_MODE. */
function configForMode(mode: string): LlmConfig {
  return loadLlmConfig({ LLM_MODE: mode, LLM_API_KEY: 'test-key', LLM_BASE_URL: 'https://llm.test' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LLM_MODE dispatch (6.4, design §5.4)', () => {
  it('stub: classifies deterministically with no network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const config = configForMode('stub');
    const first = await inferSkills('Build the responsive homepage', SEEDED, config);
    const second = await inferSkills('Build the responsive homepage', SEEDED, config);

    expect(first).toEqual({ classifiable: true, skillIds: [1] });
    expect(second).toEqual(first);
    expect(await inferSkills('Add an audit log endpoint', SEEDED, config)).toEqual({
      classifiable: true,
      skillIds: [2],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stub: works with no API key configured at all', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const config = loadLlmConfig({ LLM_MODE: 'stub' });

    expect(config.apiKey).toBeNull();
    await expect(inferSkills('Style the login form', SEEDED, config)).resolves.toEqual({
      classifiable: true,
      skillIds: [1],
    });
  });

  it('stub: a title it has nothing to say about comes back unclassifiable, not as a failure', async () => {
    // REQ-6.8 through the stub (design §5.4): no keyword matched, so the honest
    // answer is "not classifiable" — a resolved outcome, not a rejection, which
    // is what lets the offline suites cover that path at all.
    const config = configForMode('stub');

    await expect(inferSkills('buy eggs', SEEDED, config)).resolves.toEqual({
      classifiable: false,
    });
    await expect(inferSkills('123145', SEEDED, config)).resolves.toEqual({ classifiable: false });
  });

  it('fail: always throws, without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(inferSkills('Anything at all', SEEDED, configForMode('fail'))).rejects.toThrow(
      'LLM_MODE=fail',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('live: calls Gemini and maps the response through the same parse gate', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: '{"classifiable":true,"skills":["Backend","Kubernetes"]}' }],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    // The invented "Kubernetes" is dropped by parseSkillInference, not by the
    // client.
    await expect(inferSkills('Add audit logs', SEEDED, configForMode('live'))).resolves.toEqual({
      classifiable: true,
      skillIds: [2],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is selected by configuration only — same call, three behaviours', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const title = 'Build the responsive homepage';

    await expect(inferSkills(title, SEEDED, configForMode('stub'))).resolves.toEqual({
      classifiable: true,
      skillIds: [1],
    });
    await expect(inferSkills(title, SEEDED, configForMode('fail'))).rejects.toThrow();
    await expect(inferSkills(title, SEEDED, configForMode('live'))).rejects.toThrow('HTTP 500');
  });

  it('an unknown LLM_MODE degrades to live rather than to a test double', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    await expect(inferSkills('Anything', SEEDED, configForMode('stubb'))).rejects.toThrow(
      'HTTP 500',
    );
  });
});
