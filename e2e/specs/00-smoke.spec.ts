import { test, expect } from '@playwright/test';

/**
 * Proves the Playwright setup can actually drive a browser against the
 * docker-compose stack (frontend → nginx → backend → Postgres) before any of
 * the real E2E-1..8 scenarios are written on top of it.
 */
test('the SPA loads and both routes render client-side (REQ-0.7)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Task List' })).toBeVisible();

  await page.getByRole('link', { name: 'New Task' }).click();
  await expect(page.getByRole('heading', { name: 'Create Task(s)' })).toBeVisible();
  // Client-side navigation, not a full reload — the nav bar persists across
  // the route change without a fresh document load.
  await expect(page.getByRole('link', { name: 'Tasks' })).toBeVisible();
});
