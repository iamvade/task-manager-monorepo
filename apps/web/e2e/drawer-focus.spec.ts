import { expect, test } from '@playwright/test';
import { ADMIN } from './users';

/**
 * Keyboard users: the skip link is the first tab stop, the task drawer keeps Tab inside and
 * gives focus back to the row that opened it.
 */
test.describe('keyboard', () => {
  test.use({ storageState: ADMIN.state });

  test('skip link is the first tab stop and focuses the page', async ({ page }) => {
    await page.goto('/w/kite-studio/my-tasks');
    await expect(page.locator('main')).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('the task drawer traps Tab and returns focus to its row', async ({ page }) => {
    await page.goto('/w/kite-studio/my-tasks');
    const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
      workspaces: { id: string; slug: string }[];
    };
    const ws = me.workspaces.find((w) => w.slug === 'kite-studio')?.id ?? '';
    const sidebar = (await (await page.request.get(`/api/v1/workspaces/${ws}/sidebar`)).json()) as {
      spaces: { projects: { id: string; name: string }[] }[];
    };
    const app = sidebar.spaces.flatMap((s) => s.projects).find((p) => p.name === 'App Redesign');
    if (!app) throw new Error('seed data missing');

    await page.goto(`/w/kite-studio/p/${app.id}/list`);
    const row = page.locator('[role="row"][data-task-key]').first();
    const key = await row.getAttribute('data-task-key');
    await row.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: `Task ${key ?? ''}` });
    await expect(dialog).toBeVisible();
    // Focus moves into the panel (and back from the focus guards) on the next animation frame.
    const focusInside = () =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve(Boolean(document.activeElement?.closest('[role="dialog"]')));
              });
            });
          }),
      );
    await expect.poll(focusInside).toBe(true);

    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInside(), `Tab ${i + 1} left the drawer`).toBe(true);
    }
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInside(), `Shift+Tab ${i + 1} left the drawer`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator(`[role="row"][data-task-key="${key ?? ''}"]`)).toBeFocused();
  });
});
