import type { Locator, Page } from '@playwright/test';

/**
 * Locators scoped to a single `TaskFormNode` (design §6.3) by nesting depth.
 * Every helper here uses a direct-child (`>`) combinator to reach *that
 * node's own* title input / skill checkboxes / "Add Subtask" button — a plain
 * descendant selector would also match the same elements one level down,
 * since a child `TaskFormNode` is nested inside its parent's `<div>` in the
 * DOM (REQ-5.6: one recursive component, so every level has the same shape).
 */
export function formNodeAtDepth(page: Page, depth: number): Locator {
  return page.locator(`[data-testid="task-form-node"][data-depth="${depth}"]`);
}

export async function fillNodeTitle(page: Page, depth: number, title: string): Promise<void> {
  await formNodeAtDepth(page, depth)
    .locator('> label input[data-testid="task-form-title"]')
    .fill(title);
}

export async function checkNodeSkill(page: Page, depth: number, skillName: string): Promise<void> {
  await formNodeAtDepth(page, depth).locator('> fieldset').getByLabel(skillName).check();
}

export async function addSubtaskAtDepth(page: Page, depth: number): Promise<void> {
  await formNodeAtDepth(page, depth).locator('> button[data-testid="add-subtask"]').click();
}
