import { expect, test as setup } from '@playwright/test';
import { ADMIN, MEMBER, PASSWORD } from './users';

/** Signs in through the real login form once per role and keeps the session cookie. */
for (const user of [ADMIN, MEMBER]) {
  setup(`sign in as ${user.email}`, async ({ page }) => {
    // The first page load waits for Vite to transform the whole app on a cold cache.
    setup.setTimeout(150_000);
    await page.goto('/login');
    const email = page.locator('input[name="email"]');
    await email.waitFor({ timeout: 120_000 });
    await email.fill(user.email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/my-tasks/);
    await page.context().storageState({ path: user.state });
  });
}
