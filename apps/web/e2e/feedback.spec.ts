import { expect, test } from '@playwright/test';
import { MEMBER } from './users';

/** A 1×1 PNG for the attachment. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A customer sends feedback on the public form (no account); a teammate finds it in the inbox,
 * creates a task from it with the screenshot, and the task shows the report under "Linked
 * feedback".
 */
test('public feedback becomes a task', async ({ browser }) => {
  const title = `Order history is blank ${String(Date.now())}`;

  const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const form = await customer.newPage();
  // Signed out, the page is in the default language (Mongolian): fields by id.
  await form.goto('/feedback/kite-studio');
  await form.locator('label:has(input[value="bug"])').click();
  await form.locator('#fb-title').fill(title);
  await form
    .locator('#fb-body')
    .fill('Opening order history from my profile shows an empty screen every time.');
  await form.locator('input[type="file"]').setInputFiles({
    name: 'history.png',
    mimeType: 'image/png',
    buffer: PIXEL_PNG,
  });
  await form.locator('#fb-email').fill('customer@example.com');
  // Sending waits for the upload.
  await form.locator('form button[type="submit"]').click();
  const refText = form.getByText(/^FB-\d+$/);
  await expect(refText).toBeVisible();
  const ref = (await refText.textContent())?.trim() ?? '';
  expect(ref).toMatch(/^FB-\d+$/);
  await customer.close();

  // Every member triages (Dorj is a member).
  const team = await browser.newContext({ storageState: MEMBER.state });
  const page = await team.newPage();
  await page.goto('/w/kite-studio/feedback');
  await page.getByRole('searchbox', { name: 'Search feedback or submitters…' }).fill(title);
  await page.getByRole('link', { name: title }).click();
  const panel = page.getByRole('dialog', { name: `Feedback ${ref}` });
  await expect(panel.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Open preview: history\.png/ })).toBeVisible();

  await panel.getByRole('button', { name: 'Create task from feedback' }).click();
  const modal = page.getByRole('dialog', { name: 'Create task from feedback' });
  await expect(modal.getByRole('textbox', { name: 'Task title' })).toHaveValue(title);
  await expect(modal.getByRole('textbox', { name: 'Description' })).not.toHaveValue(
    /customer@example\.com/,
  );
  await modal.getByRole('button', { name: 'Create task' }).click();
  await expect(modal).toBeHidden();
  await expect(panel.getByRole('button', { name: 'Unlink' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Status/ })).toContainText('Linked to task');

  await panel.getByRole('button', { name: 'Open task' }).click();
  const drawer = page.getByRole('dialog');
  const linked = drawer.getByRole('region', { name: 'Linked feedback' });
  await expect(linked.getByRole('link', { name: `Open ${ref}: ${title}` })).toBeVisible();
  await expect(drawer.getByRole('region', { name: 'Attachments' })).toContainText('history.png');
  await team.close();
});
