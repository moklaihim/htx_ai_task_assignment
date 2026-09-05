import type { Locator, Page } from '@playwright/test';

/**
 * Shared locators for the Task List Page's per-row controls, used by every
 * spec that touches E2E-1 through E2E-6 (design §8.3). Centralized here so
 * each scenario reads by *behavior* (find the row for this title, its
 * assignee control, its status control) rather than re-deriving selectors
 * from the DOM structure in every spec file.
 *
 * Every scenario below gives its Task a title unique to the test run (a
 * timestamp/random suffix), so a plain substring match on the title cell is
 * enough to find the right row without colliding with seeded or
 * previously-created data still sitting in the shared compose stack's volume.
 */

/** The `<tr>` for a Task whose title contains this text, wherever it sits in the tree. */
export function taskRow(page: Page, title: string): Locator {
  return page.locator('tr[data-testid="task-row"]').filter({
    has: page.locator('td[data-testid="task-title"]', { hasText: title }),
  });
}

export function assigneeSelect(page: Page, title: string): Locator {
  return taskRow(page, title).locator('td[data-testid="task-assignee"] select');
}

export function assigneeUpdateButton(page: Page, title: string): Locator {
  return taskRow(page, title).locator('td[data-testid="task-assignee"] button');
}

export function statusSelect(page: Page, title: string): Locator {
  return taskRow(page, title).locator('td[data-testid="task-status"] select');
}

export function statusUpdateButton(page: Page, title: string): Locator {
  return taskRow(page, title).locator('td[data-testid="task-status"] button');
}

export function skillTags(page: Page, title: string): Locator {
  return taskRow(page, title).locator('td[data-testid="task-skills"]');
}
