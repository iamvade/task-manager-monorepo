import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from './users';

/**
 * Anu writes her standup on a desktop (Mobile team) and on a phone (Design team, the empty
 * group, opened by the reminder link): removes a suggestion, picks a Today chip, adds a
 * blocker with a linked task and a helper, posts, and the task shows Blocked in List and
 * Board. Groups meet Mon–Fri in their own zone: on other days there is nothing to write.
 */

interface Ids {
  workspace: string;
  mobileGroup: string;
  designGroup: string;
}

async function lookup(page: Page): Promise<Ids> {
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    workspaces: { id: string }[];
  };
  const workspace = me.workspaces[0]?.id ?? '';
  const groups = (await (
    await page.request.get(`/api/v1/workspaces/${workspace}/standup-groups`)
  ).json()) as { id: string; name: string }[];
  const mobile = groups.find((g) => g.name === 'Mobile team');
  const design = groups.find((g) => g.name === 'Design team');
  if (!mobile || !design) throw new Error('seed data missing');
  return { workspace, mobileGroup: mobile.id, designGroup: design.id };
}

async function isStandupDay(page: Page, groupId: string): Promise<boolean> {
  const day = (await (
    await page.request.get(`/api/v1/standup-groups/${groupId}/days/today`)
  ).json()) as { isStandupDay: boolean };
  return day.isStandupDay;
}

/** A project's id, looked up through the API with the page's session. */
async function projectId(page: Page, workspace: string, name: string): Promise<string> {
  const sidebar = (await (
    await page.request.get(`/api/v1/workspaces/${workspace}/sidebar`)
  ).json()) as { spaces: { projects: { id: string; name: string }[] }[] };
  const project = sidebar.spaces.flatMap((s) => s.projects).find((p) => p.name === name);
  if (!project) throw new Error(`No project "${name}"`);
  return project.id;
}

/** The task shows "Blocked" (with my blocker's text) on its List row and its Board card. */
async function expectBlocked(page: Page, project: string, title: string, blocker: string) {
  await page.goto(`/p/${project}/list`);
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(
    row.getByRole('link', { name: new RegExp(`^Blocked: ${blocker}`) }).first(),
  ).toBeVisible();
  await page.goto(`/p/${project}/board?sprint=none`);
  const card = page.getByRole('link', { name: new RegExp(title.replace(/[()]/g, '\\$&')) });
  await expect(card).toContainText('Blocked');
  await expect(card).toContainText(blocker);
}

test.describe('desktop', () => {
  test.use({ storageState: ADMIN.state });

  test('Anu writes her update (autosaved draft, chip, linked blocker), then reacts and replies', async ({
    page,
  }) => {
    await page.goto('/my-tasks');
    await page
      .getByRole('navigation', { name: 'Workspace' })
      .getByRole('link', { name: 'Mobile team' })
      .click();
    await expect(page.getByRole('region', { name: 'Who has posted' })).toBeVisible();
    const write = page.getByRole('link', { name: 'Write update' }).first();
    test.skip((await write.count()) === 0, 'No standup today');

    await write.click();
    let dialog = page.getByRole('dialog', { name: 'Your standup' });
    await expect(dialog.getByRole('group', { name: /^Today/ })).toBeVisible();
    // Remove a suggestion from Yesterday; it can come back.
    await dialog.getByRole('button', { name: 'Remove: Approve icon grid guidelines' }).click();
    await expect(dialog.getByRole('button', { name: 'Restore 1 removed' })).toBeVisible();
    const today = dialog.getByRole('textbox', { name: 'Anything else today?' });
    await today.fill('Pair with Dorj on the refund flow');
    await today.press('Enter');
    // The draft saves itself; closing and reopening brings it back.
    await expect(dialog.getByText(/^Draft saved/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('link', { name: 'Write update' }).first().click();
    dialog = page.getByRole('dialog', { name: 'Your standup' });
    await expect(dialog.getByRole('textbox', { name: 'Today item' })).toHaveValue(
      'Pair with Dorj on the refund flow',
    );
    await expect(dialog.getByRole('button', { name: 'Restore 1 removed' })).toBeVisible();
    await expect(dialog.getByText('Approve icon grid guidelines')).toHaveCount(0);

    const chip = dialog.getByRole('button', { name: /Checkout page — responsive layout/ });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');

    await dialog.getByRole('textbox', { name: 'Blocker 1' }).fill('Waiting on legal sign-off');
    await dialog.getByRole('button', { name: 'Link a task' }).click();
    await page.getByRole('option', { name: /Write PRD: saved carts/ }).click();
    await expect(dialog.getByRole('button', { name: 'Remove link' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Who can help' }).click();
    await page.getByRole('option', { name: /^Dorj E\./ }).click();
    await page.keyboard.press('Escape');
    await expect(dialog.getByText('@Dorj E.')).toBeVisible();
    await dialog.getByRole('button', { name: /Post update/ }).click();
    await expect(dialog).toBeHidden();

    const mine = page.getByRole('article', { name: 'Anu B.' });
    await expect(mine.getByText('Pair with Dorj on the refund flow')).toBeVisible();
    await expect(mine.getByText('Checkout page — responsive layout')).toBeVisible();
    await expect(mine.getByText('Approve icon grid guidelines')).toHaveCount(0);
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

    const { workspace } = await lookup(page);
    await expectBlocked(
      page,
      await projectId(page, workspace, 'Checkout v2'),
      'Write PRD: saved carts',
      'Waiting on legal sign-off',
    );
  });
});

test.describe('phone', () => {
  test.use({
    storageState: ADMIN.state,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('Anu posts from the reminder link on a 390×844 screen', async ({ page }) => {
    await page.goto('/my-tasks');
    const ids = await lookup(page);
    test.skip(!(await isStandupDay(page, ids.designGroup)), 'No standup today');

    // The reminder notification's link: straight to writing.
    await page.goto(`/standup/${ids.designGroup}?write=1`);
    const dialog = page.getByRole('dialog', { name: 'Your standup' });
    await expect(dialog.getByRole('group', { name: /^Today/ })).toBeVisible();
    // Full screen, no Save draft (drafts autosave).
    const box = await dialog.boundingBox();
    expect(box?.width).toBe(390);
    await expect(dialog.getByRole('button', { name: 'Save draft' })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Remove: Approve icon grid guidelines' }).tap();
    await expect(dialog.getByRole('button', { name: 'Restore 1 removed' })).toBeVisible();
    const chip = dialog.getByRole('button', { name: /^Redesign onboarding flow \(3 screens\)/ });
    await chip.tap();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');

    const blocker = dialog.getByRole('textbox', { name: 'Blocker 1' });
    await blocker.fill('Need the final onboarding illustrations');
    await dialog.getByRole('button', { name: 'Link a task' }).tap();
    await page.getByRole('option', { name: /Redesign onboarding flow \(3 screens\)/ }).tap();
    await expect(
      dialog.getByRole('button', { name: /^Link a task: Redesign onboarding flow/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Who can help' }).tap();
    await page.getByRole('option', { name: /^Sara K\./ }).tap();
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('button', { name: 'Who can help: @Sara K.' })).toBeVisible();

    // The keyboard takes the bottom of the screen: Post stays in view above it.
    const post = dialog.getByRole('button', { name: 'Post update' });
    await blocker.focus();
    await page.setViewportSize({ width: 390, height: 480 });
    await expect(post).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 390, height: 844 });
    await post.tap();
    await expect(dialog).toBeHidden();

    // The group page in one column, blockers first.
    const mine = page.getByRole('article', { name: 'Anu B.' });
    await expect(mine.getByText('Redesign onboarding flow (3 screens)').first()).toBeVisible();
    await expect(mine.getByText('Approve icon grid guidelines')).toHaveCount(0);
    const blockers = page.getByRole('region', { name: 'Blockers' });
    await expect(blockers.getByText('Need the final onboarding illustrations')).toBeVisible();
    const blockersTop = (await blockers.boundingBox())?.y ?? Infinity;
    const updatesTop =
      (await page.getByRole('heading', { name: 'Today’s updates' }).boundingBox())?.y ?? 0;
    expect(blockersTop).toBeLessThan(updatesTop);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await expectBlocked(
      page,
      await projectId(page, ids.workspace, 'App Redesign'),
      'Redesign onboarding flow (3 screens)',
      'Need the final onboarding illustrations',
    );
  });
});
