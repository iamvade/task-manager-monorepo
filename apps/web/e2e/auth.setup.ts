import { expect, test as setup } from '@playwright/test';
import { ADMIN, MEMBER, PASSWORD, VADE } from './users';

/** Signs in through the real login form once per role and keeps the session cookie. */
for (const user of [ADMIN, MEMBER, VADE]) {
  setup(`sign in as ${user.email}`, async ({ page }) => {
    // The first page load waits for Vite to transform the whole app on a cold cache.
    setup.setTimeout(150_000);
    await page.goto('/login');
    const email = page.locator('input[name="email"]');
    await email.waitFor({ timeout: 120_000 });
    await email.fill(user.email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    // The platform admin has no workspace: everything sends them to the admin console.
    await expect(page).toHaveURL(user === VADE ? /\/admin$/ : /\/my-tasks/);
    await page.context().storageState({ path: user.state });
  });
}
