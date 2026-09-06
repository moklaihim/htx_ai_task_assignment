import { test, expect } from '@playwright/test';
import {
  taskRow,
  assigneeSelect,
  assigneeUpdateButton,
  statusSelect,
  statusUpdateButton,
  skillTags,
} from '../helpers/taskRow';
import { fillNodeTitle, checkNodeSkill, addSubtaskAtDepth } from '../helpers/taskForm';

/**
 * E2E-1 through E2E-6. Every scenario picks required Skills explicitly in the
 * Task Creation form, so none of these trigger LLM inference (REQ-6.1 only
 * fires on an *empty* Skills list) — that path is covered separately by
 * E2E-7/E2E-8, where `LLM_MODE` matters.
 *
 * Run serially, in one describe block: E2E-2 through E2E-6 all operate on
 * Tasks created by E2E-1/E2E-5, so later scenarios depend on earlier ones
 * having already run against the same live stack.
 */
test.describe.serial('E2E-1..6: task list and creation flows', () => {
  const runId = Date.now();
  const soloTitle = `E2E solo task ${runId}`;
  const rootTitle = `E2E tree root ${runId}`;
  const childTitle = `E2E tree child ${runId}`;
  const grandchildTitle = `E2E tree grandchild ${runId}`;

  test('E2E-1: create a task with skills selected → appears on the list with those skills', async ({
    page,
  }) => {
    await page.goto('/tasks/new');
    await fillNodeTitle(page, 0, soloTitle);
    await checkNodeSkill(page, 0, 'Frontend');
    await page.getByTestId('save-task').click();

    await expect(page).toHaveURL('/');
    await expect(taskRow(page, soloTitle)).toBeVisible();
    await expect(skillTags(page, soloTitle)).toContainText('Frontend');
  });

  test('E2E-2: assignee dropdown on a Frontend-only task offers only Alice and Carol', async ({
    page,
  }) => {
    await page.goto('/');
    const select = assigneeSelect(page, soloTitle);
    const options = await select.locator('option').allTextContents();

    expect(options).toContain('Alice');
    expect(options).toContain('Carol');
    expect(options).not.toContain('Bob');
    expect(options).not.toContain('Dave');
  });

  test('E2E-3: assignee Update button follows the three-state pattern', async ({ page }) => {
    await page.goto('/');
    const select = assigneeSelect(page, soloTitle);
    const button = assigneeUpdateButton(page, soloTitle);

    // Matches the saved (unassigned) value → disabled.
    await expect(button).toBeDisabled();

    await select.selectOption({ label: 'Alice' });
    const aliceValue = await select.inputValue();
    await expect(button).toBeEnabled();

    // Slow the PATCH down so the mid-request disabled state is observable
    // rather than racing a same-tick response.
    await page.route('**/tasks/*/assign', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await button.click();
    await expect(select).toBeDisabled();
    await expect(button).toBeDisabled();

    // Both settle once the (deliberately slowed) request completes.
    await expect(button).toBeDisabled({ timeout: 10_000 });
    await expect(select).toBeEnabled();
    await expect(select).toHaveValue(aliceValue);
  });

  test('E2E-4: status Update button follows the three-state pattern', async ({ page }) => {
    await page.goto('/');
    const select = statusSelect(page, soloTitle);
    const button = statusUpdateButton(page, soloTitle);

    await expect(select).toHaveValue('To-do');
    await expect(button).toBeDisabled();

    await select.selectOption('In Progress');
    await expect(button).toBeEnabled();
    await button.click();

    await expect(button).toBeDisabled();
    await expect(select).toHaveValue('In Progress');
  });

  test('E2E-5: build a 3-level tree with Add Subtask at each level, save, reopen the list', async ({
    page,
  }) => {
    await page.goto('/tasks/new');

    await fillNodeTitle(page, 0, rootTitle);
    await checkNodeSkill(page, 0, 'Backend');
    await addSubtaskAtDepth(page, 0);

    await fillNodeTitle(page, 1, childTitle);
    await checkNodeSkill(page, 1, 'Backend');
    await addSubtaskAtDepth(page, 1);

    await fillNodeTitle(page, 2, grandchildTitle);
    await checkNodeSkill(page, 2, 'Backend');

    await page.getByTestId('save-task').click();
    await expect(page).toHaveURL('/');

    const rootRow = taskRow(page, rootTitle);
    const childRow = taskRow(page, childTitle);
    const grandchildRow = taskRow(page, grandchildTitle);

    await expect(rootRow).toBeVisible();
    await expect(childRow).toBeVisible();
    await expect(grandchildRow).toBeVisible();

    await expect(rootRow).toHaveAttribute('data-depth', '0');
    await expect(childRow).toHaveAttribute('data-depth', '1');
    await expect(grandchildRow).toHaveAttribute('data-depth', '2');

    // Nesting preserved through a fresh read, not just the immediate response.
    await page.reload();
    await expect(taskRow(page, rootTitle)).toHaveAttribute('data-depth', '0');
    await expect(taskRow(page, childTitle)).toHaveAttribute('data-depth', '1');
    await expect(taskRow(page, grandchildTitle)).toHaveAttribute('data-depth', '2');
  });

  test('E2E-6: Done is blocked by a To-do grandchild, then succeeds once all descendants are Done', async ({
    page,
  }) => {
    await page.goto('/');

    const rootStatus = statusSelect(page, rootTitle);
    const rootButton = statusUpdateButton(page, rootTitle);

    await rootStatus.selectOption('Done');
    await rootButton.click();

    // REQ-5.3: rejected because the grandchild is still To-do — the toast
    // names the failure and the dropdown reverts rather than showing a value
    // the server refused.
    await expect(page.getByTestId('toast').filter({ hasText: /subtask|Done/i })).toBeVisible();
    await expect(rootStatus).toHaveValue('To-do');

    // Mark every descendant Done, deepest first.
    const grandchildStatus = statusSelect(page, grandchildTitle);
    await grandchildStatus.selectOption('Done');
    await statusUpdateButton(page, grandchildTitle).click();
    await expect(statusUpdateButton(page, grandchildTitle)).toBeDisabled();

    const childStatus = statusSelect(page, childTitle);
    await childStatus.selectOption('Done');
    await statusUpdateButton(page, childTitle).click();
    await expect(statusUpdateButton(page, childTitle)).toBeDisabled();

    // Retry: every descendant is now Done, so this succeeds.
    await rootStatus.selectOption('Done');
    await rootButton.click();
    await expect(rootStatus).toHaveValue('Done');
  });
});
