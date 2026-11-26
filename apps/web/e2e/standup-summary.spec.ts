import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, PASSWORD } from './users';

/**
 * The Mobile team's meeting summary: Bat (facilitator) writes it on the group page (autosaved)
 * and creates a task from Dorj's blocker through quick create; Anu reads both on her page. The
 * seed's posts are on today, so this runs on any day.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectAccessible(page: Page, what: string) {
  await page.waitForTimeout(300);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect
    .soft(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      what,
    )
    .toEqual([]);
}

async function signIn(browser: Browser, baseURL: string, email: string): Promise<Page> {
  // New contexts get the file's `use` options (Anu's session): start signed out.
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/my-tasks/);
  return page;
}

async function mobileTeam(page: Page) {
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    workspaces: { id: string; slug: string }[];
  };
  const groups = (await (
    await page.request.get(
      `/api/v1/workspaces/${me.workspaces.find((w) => w.slug === 'kite-studio')?.id ?? ''}/standup-groups`,
    )
  ).json()) as { id: string; name: string; today: string }[];
  const group = groups.find((g) => g.name === 'Mobile team');
  if (!group) throw new Error('seed data missing');
  return group;
}

test.use({ storageState: ADMIN.state });

test('Bat writes the meeting summary and creates a task from a blocker; Anu reads them', async ({
  page: anu,
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const group = await mobileTeam(anu);
  // The seed posts on today even when it's a weekend or holiday; a day with posts takes a summary.
  const page = `/w/kite-studio/standup/${group.id}/${group.today}`;

  // Anu (not the facilitator) sees no editor and no Create task buttons.
  await anu.goto(page);
  await expect(anu.getByRole('region', { name: 'Who has posted' })).toBeVisible();
  await expect(anu.getByRole('button', { name: /^Create task:/ })).toHaveCount(0);

  const bat = await signIn(browser, baseURL ?? '', 'bat@kite.test');
  await bat.goto(page);
  const summary = bat.getByRole('region', { name: 'Meeting summary' });
  await summary
    .getByRole('textbox', { name: 'Meeting summary' })
    .fill('Bat renews the sandbox keys today');
  await expect(summary.getByText('Saved', { exact: true })).toBeVisible();
  await expectAccessible(bat, 'Standup summary editor');

  // Create task from Dorj's blocker: quick create opens prefilled.
  await bat
    .getByRole('region', { name: 'Blockers' })
    .getByRole('button', { name: /^Create task: Payment provider sandbox/ })
    .click();
  const dialog = bat.getByRole('dialog');
  await expect(dialog.locator('#quick-create-title')).toHaveValue(
    'Payment provider sandbox API keys have expired',
  );
  await expect(dialog.getByRole('link', { name: /From the Mobile team standup on/ })).toBeVisible();
  // ⌘↵ does nothing until the project has loaded (the Create button is disabled till then).
  await expect(dialog.getByRole('button', { name: /^Create task/ })).toBeEnabled();
  await bat.keyboard.press('ControlOrMeta+Enter');
  await expect(dialog).toBeHidden();
  await expect(summary.getByText('From Dorj’s blocker', { exact: false })).toBeVisible();
  await expect(
    bat.getByRole('region', { name: 'Blockers' }).getByRole('link', { name: /Created/ }),
  ).toBeFocused();

  // Anu reads both (realtime refetch).
  const read = anu.getByRole('region', { name: 'Meeting summary' });
  await expect(read.getByText('Bat renews the sandbox keys today')).toBeVisible();
  await expect(read.getByText('Payment provider sandbox API keys have expired')).toBeVisible();
  await expect(read.getByRole('textbox')).toHaveCount(0);
  await bat.context().close();
});
