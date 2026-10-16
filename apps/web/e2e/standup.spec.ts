import { expect, test } from '@playwright/test';
import { ADMIN } from './users';

test.describe('admin', () => {
  test.use({ storageState: ADMIN.state });

  test('Anu posts her standup update, then reacts and replies on a teammate’s', async ({
    page,
  }) => {
    await page.goto('/my-tasks');
    await page
      .getByRole('navigation', { name: 'Workspace' })
      .getByRole('link', { name: 'Mobile team' })
      .click();
    await expect(page.getByRole('region', { name: 'Who has posted' })).toBeVisible();
    const write = page.getByRole('link', { name: 'Write update' }).first();
    // Groups meet Mon–Fri in their own zone: on a weekend there is nothing to write.
    test.skip((await write.count()) === 0, 'No standup today');

    await write.click();
    const dialog = page.getByRole('dialog', { name: 'Your standup' });
    await expect(dialog.getByRole('group', { name: /^Today/ })).toBeVisible();
    const today = dialog.getByRole('textbox', { name: 'Anything else today?' });
    await today.fill('Pair with Dorj on the refund flow');
    await today.press('Enter');
    await dialog.getByRole('textbox', { name: 'Blocker 1' }).fill('Waiting on legal sign-off');
    await dialog.getByRole('button', { name: /Post update/ }).click();
    await expect(dialog).toBeHidden();

    const mine = page.getByRole('article', { name: 'Anu B.' });
    await expect(mine.getByText('Pair with Dorj on the refund flow')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Blockers' }).getByText('Waiting on legal sign-off'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit update' })).toBeVisible();

    const other = page.locator('article:not([aria-label="Anu B."])').first();
    await other.getByRole('button', { name: 'Add reaction' }).click();
    await page.getByRole('button', { name: 'Love', exact: true }).click();
    await expect(other.getByRole('button', { name: /^Love, \d+$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const reply = other.getByRole('combobox', { name: 'Reply' });
    await reply.fill('On it after lunch');
    await reply.press('Enter');
    await expect(other.getByText('On it after lunch')).toBeVisible();
  });
});
