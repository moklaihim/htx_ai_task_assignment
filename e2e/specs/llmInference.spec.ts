import { test, expect, type Page } from '@playwright/test';
import { fillNodeTitle } from '../helpers/taskForm';
import { taskRow, skillTags } from '../helpers/taskRow';
import { setBackendLlmMode, resetBackendLlmMode } from '../helpers/composeEnv';

/** Toasts of the green `success` kind — the REQ-4.8 confirmation among them. */
const successToast = (page: Page) => page.locator('[data-testid="toast"][data-kind="success"]');

/**
 * E2E-7, E2E-8 and E2E-9. All three create a Task with an empty Skills list,
 * which is what triggers LLM inference (REQ-6.1) — the opposite of every
 * scenario in `taskFlows.spec.ts`, which always picks Skills explicitly and
 * so never reaches this path.
 *
 * `LLM_MODE` is forced per scenario by recreating the `backend` container
 * (`helpers/composeEnv.ts`), never left as whatever `live` default `.env`
 * happens to hold — so this suite makes no live Gemini call and spends no
 * quota, regardless of what a reviewer has configured.
 */
test.describe.serial('E2E-7, E2E-8 and E2E-9: LLM skill inference', () => {
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

    // REQ-4.8 — inference is otherwise invisible: the form was submitted with
    // no Skills ticked, and without this the user only sees a row that somehow
    // has skills. Green, and it names what was chosen.
    // Matched on kind *and* text: the REQ-4.7 info toast reads "No Skills
    // detected…", so text alone would match either notice.
    const detectedToast = successToast(page).filter({ hasText: /Skills detected/ });
    await expect(detectedToast).toBeVisible();
    await expect(detectedToast).toContainText('Frontend');
    await expect(detectedToast).toBeHidden({ timeout: 16_000 });
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
    await expect(failureToast).toBeHidden({ timeout: 16_000 });
  });

  test('E2E-9: LLM_MODE=stub — an unclassifiable title is reported as info, not as an error', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await setBackendLlmMode('stub');

    // No keyword for the stub to match, so it answers "not a software task"
    // (REQ-6.8) — the same empty Skills list as E2E-8, arrived at without
    // anything going wrong.
    const title = `E2E llm gibberish ${Date.now()} qwzxjk`;
    await page.goto('/tasks/new');
    await fillNodeTitle(page, 0, title);
    await page.getByTestId('save-task').click();

    await expect(page).toHaveURL('/');
    await expect(taskRow(page, title)).toBeVisible();
    await expect(skillTags(page, title)).toHaveText('—');

    // REQ-4.7 — the distinction this scenario exists for: an `info` toast
    // naming the cause, and *no* error toast, for a correctly-classified
    // non-task.
    const infoToast = page.getByTestId('toast').filter({ hasText: /No Skills detected/i });
    await expect(infoToast).toBeVisible();
    await expect(infoToast).toHaveAttribute('data-kind', 'info');
    await expect(page.getByTestId('toast').filter({ hasText: /failed/i })).toHaveCount(0);
    await expect(successToast(page).filter({ hasText: /Skills detected/ })).toHaveCount(0);

    await expect(infoToast).toBeHidden({ timeout: 16_000 });
  });
});
