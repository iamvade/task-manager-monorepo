import { expect, test } from '@playwright/test';
import { PASSWORD, SARA } from './users';

/**
 * Signing out ends on the sign-in page right away (no reload). Signs in fresh: logging out
 * deletes the session, so the shared storage states must not be used here.
 */
test('sign out lands on the sign-in page without a refresh', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(SARA.email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/w\/kite-studio\/my-tasks$/);

  await page.getByRole('button', { name: /— Account menu$/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.locator('input[name="email"]')).toBeVisible();

  // The session is gone: app pages send back to sign-in.
  await page.goto('/w/kite-studio/my-tasks');
  await expect(page).toHaveURL(/\/login\?next=/);
});
