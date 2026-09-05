import { test, expect } from '@playwright/test';
import { fillNodeTitle } from '../helpers/taskForm';
import { taskRow, skillTags } from '../helpers/taskRow';
import { setBackendLlmMode, resetBackendLlmMode } from '../helpers/composeEnv';

/**
 * E2E-7 and E2E-8 (design §8.3, task 7.3). Both create a Task with an empty
 * Skills list, which is what triggers LLM inference (REQ-6.1) — the opposite
 * of every scenario in `taskFlows.spec.ts`, which always picks Skills
 * explicitly and so never reaches this path.
 *
 * `LLM_MODE` is forced per scenario by recreating the `backend` container
 * (`helpers/composeEnv.ts`), never left as whatever `live` default `.env`
 * happens to hold — so this suite makes no live Gemini call and spends no
 * quota, regardless of what a reviewer has configured (task 7.3 acceptance).
 */
test.describe.serial('E2E-7 and E2E-8: LLM skill inference', () => {
  test.afterAll(async () => {
    await resetBackendLlmMode();
  });

  test('E2E-7: LLM_MODE=stub — a task with no skills gets skills without user action', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await setBackendLlmMode('stub');

    const title = `E2E llm stub ${Date.now()} responsive homepage mobile desktop`;
    await page.goto('/tasks/new');
    await fillNodeTitle(page, 0, title);
    // No skill checkbox ticked — REQ-6.1 fires because skillIds is empty.
    await page.getByTestId('save-task').click();

    await expect(page).toHaveURL('/');
    await expect(taskRow(page, title)).toBeVisible();
    await expect(skillTags(page, title)).toContainText('Frontend');
  });

  test('E2E-8: LLM_MODE=fail — task saved with no skills, toast appears and auto-dismisses', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await setBackendLlmMode('fail');

    const title = `E2E llm fail ${Date.now()}`;
    await page.goto('/tasks/new');
    await fillNodeTitle(page, 0, title);
    await page.getByTestId('save-task').click();

    await expect(page).toHaveURL('/');
    await expect(taskRow(page, title)).toBeVisible();
    await expect(skillTags(page, title)).toHaveText('—');

    // REQ-4.6: non-modal, informational, auto-dismissing — the save above
    // already completed and navigated away, unaffected by this toast.
    const failureToast = page.getByTestId('toast').filter({ hasText: /skill detection failed/i });
    await expect(failureToast).toBeVisible();
    await expect(failureToast).toBeHidden({ timeout: 8_000 });
  });
});
