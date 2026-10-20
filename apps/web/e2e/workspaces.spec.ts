import { expect, test } from '@playwright/test';
import { ADMIN } from './users';

/**
 * Anu is in two workspaces: Kite Studio and the seed's small Kite Labs (Bat's), whose one
 * project is keyed APP like App Redesign. Each page lives under `/w/:slug`.
 */
test.describe('several workspaces', () => {
  test.use({ storageState: ADMIN.state });

  test('old links land in a workspace; the switcher moves between them', async ({ page }) => {
    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/w\/kite-studio\/my-tasks$/);

    // Anu has an unread assignment in Kite Labs.
    const trigger = page.getByRole('button', {
      name: 'Kite Studio — Switch workspace. New notifications in another workspace',
    });
    await trigger.click();
    await page.getByRole('menuitemradio', { name: /^Kite Labs/ }).click();
    await expect(page).toHaveURL(/\/w\/kite-labs\/my-tasks$/);
    await expect(page.getByRole('main')).toContainText('Try offline sync');

    await page.goto('/w/kite-labs/inbox');
    await expect(page.getByRole('main')).toContainText('Try offline sync');
  });

  test('the same task key opens the task of the workspace in the URL', async ({ page }) => {
    await page.goto('/w/kite-labs/t/APP-1');
    await expect(page.getByRole('main')).toContainText('Try offline sync');
    await page.goto('/w/kite-studio/t/APP-1');
    await expect(page.getByRole('main')).toContainText('APP-1');
    await expect(page.getByRole('main')).not.toContainText('Try offline sync');
  });
});
