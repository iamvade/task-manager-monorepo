import { expect, test } from '@playwright/test';
import { VADE } from './users';

test.use({ storageState: VADE.state });

/**
 * The platform admin creates a workspace and copies the owner's link; the owner opens it signed
 * out, creates an account and lands in the new workspace. The link then stops being re-issuable.
 * Then the owner's password is reset through a link from the admin's Users search.
 */
test('platform admin creates a workspace and its owner joins', async ({ page, browser }) => {
  const stamp = String(Date.now());
  const name = `Steppe Co ${stamp}`;
  const ownerEmail = `owner-${stamp}@example.com`;

  await page.goto('/w/kite-studio/my-tasks');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByLabel('Workspace name').fill(name);
  await expect(page.getByLabel('Address')).toHaveValue(`steppe-co-${stamp}`);
  await page.getByLabel("Owner's email").fill(ownerEmail);
  await page.getByRole('button', { name: 'Create workspace' }).click();

  const linkInput = page.getByLabel(`Invite link for ${ownerEmail}`);
  await expect(linkInput).toBeVisible();
  const link = await linkInput.inputValue();
  expect(link).toMatch(/\/invite\/[\w-]+$/);
  const row = page
    .getByRole('region', { name: 'All workspaces' })
    .getByRole('listitem')
    .filter({ hasText: name });
  await expect(row).toContainText(`Owner invite sent to ${ownerEmail}`);

  const owner = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const invite = await owner.newPage();
  await invite.goto(link);
  // Signed out, the page is in the default language (Mongolian): fields by name.
  await invite.locator('input[name="name"]').fill('Steppe Owner');
  await invite.locator('input[name="new-password"]').fill('password123');
  await invite.locator('input[name="confirm-password"]').fill('password123');
  await invite.locator('button[type="submit"]').click();
  await expect(invite).toHaveURL(/\/my-tasks/);
  await expect(invite.getByRole('navigation').first()).toContainText(name);
  await owner.close();

  await page.reload();
  await expect(row).toContainText('Owner: Steppe Owner');
  await expect(row.getByRole('button', { name: 'New owner link' })).toHaveCount(0);

  // The owner forgets their password: the admin finds them and makes a reset link.
  await page.getByLabel('Search by name or email').fill(ownerEmail);
  const userRow = page
    .getByRole('region', { name: 'Users' })
    .getByRole('listitem')
    .filter({ hasText: ownerEmail });
  await expect(userRow).toContainText(name);
  await userRow.getByRole('button', { name: 'Reset password' }).click();
  const resetInput = page.getByLabel(`Password reset link for ${ownerEmail}`);
  await expect(resetInput).toBeVisible();
  const resetLink = await resetInput.inputValue();
  expect(resetLink).toMatch(/\/reset-password\/[\w-]+$/);

  const forgot = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const reset = await forgot.newPage();
  await reset.goto(resetLink);
  await reset.locator('input[name="new-password"]').fill('new-password-456');
  await reset.locator('input[name="confirm-password"]').fill('new-password-456');
  await reset.locator('button[type="submit"]').click();
  await reset.getByRole('link').click();
  await expect(reset).toHaveURL(/\/login$/);
  await reset.locator('input[name="email"]').fill(ownerEmail);
  await reset.locator('input[name="password"]').fill('new-password-456');
  await reset.locator('button[type="submit"]').click();
  await expect(reset).toHaveURL(/\/my-tasks/);
  // Used once: the link is dead now.
  await reset.goto(resetLink);
  await expect(reset.locator('input[name="new-password"]')).toHaveCount(0);
  await forgot.close();
});
