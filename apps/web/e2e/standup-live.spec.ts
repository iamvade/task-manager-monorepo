import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, PASSWORD } from './users';

/**
 * The Mobile team's live meeting: Bat (facilitator) starts it and drives it, Anu follows in
 * another browser. ← → move both screens; "Create task" on Dorj's blocker opens quick create
 * prefilled; the task shows under Tasks created for both; notes are saved to the standup and
 * the day page shows them after the meeting ends. The group meets Mon–Fri in its own zone.
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
  ).json()) as { id: string; name: string; today: string; meetsToday: boolean }[];
  const group = groups.find((g) => g.name === 'Mobile team');
  if (!group) throw new Error('seed data missing');
  return group;
}

test.use({ storageState: ADMIN.state });

test('Bat runs the standup meeting, Anu follows, a task and notes land on the standup page', async ({
  page: anu,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const group = await mobileTeam(anu);
  test.skip(!group.meetsToday, 'The Mobile team has no standup today');
  const bat = await signIn(browser, baseURL ?? '', 'bat@kite.test');
  const live = `/w/kite-studio/standup/${group.id}/${group.today}/live`;

  // Bat starts it from the group page; Anu sees "Join live" there.
  await bat.goto(`/w/kite-studio/standup/${group.id}`);
  await bat.getByRole('button', { name: 'Start standup' }).click();
  await expect(bat).toHaveURL(new RegExp(`${live}$`));
  const order = bat.getByRole('navigation', { name: 'Speaking order' });
  await expect(order.getByRole('button', { name: /speaking now$/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
  // Posting order: Sara posted first.
  await expect(bat.getByRole('heading', { level: 1 })).toHaveText('Sara K.');
  await expect(order.getByRole('img', { name: /out of office$/ })).toBeVisible();

  await anu.goto(`/w/kite-studio/standup/${group.id}`);
  await anu.getByRole('link', { name: 'Join live' }).first().click();
  await expect(anu).toHaveURL(new RegExp(`${live}$`));
  await expect(anu.getByText('Bat O. runs the meeting. This page moves with them.')).toBeVisible();
  await expect(anu.getByRole('button', { name: 'Next' })).toHaveCount(0);

  // → three times: Bat, Temuulen, Dorj. Anu's screen follows.
  for (const name of ['Bat O.', 'Temuulen G.', 'Dorj E.']) {
    await bat.keyboard.press('ArrowRight');
    await expect(bat.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(anu.getByRole('heading', { level: 1 })).toHaveText(name);
  }
  await bat.keyboard.press('ArrowLeft');
  await expect(anu.getByRole('heading', { level: 1 })).toHaveText('Temuulen G.');
  await bat.keyboard.press('ArrowRight');
  await expect(anu.getByRole('heading', { level: 1 })).toHaveText('Dorj E.');
  await expectAccessible(bat, 'Live · driver');
  await expectAccessible(anu, 'Live · follower');

  // Create task from Dorj's blocker: quick create opens prefilled.
  await bat.getByRole('button', { name: /^Create task: Payment provider sandbox/ }).click();
  const dialog = bat.getByRole('dialog');
  await expect(dialog.locator('#quick-create-title')).toHaveValue(
    'Payment provider sandbox API keys have expired',
  );
  await expect(dialog.getByRole('link', { name: /From the Mobile team standup on/ })).toBeVisible();
  // ⌘↵ does nothing until the project has loaded (the Create button is disabled till then).
  await expect(dialog.getByRole('button', { name: /^Create task/ })).toBeEnabled();
  await bat.keyboard.press('ControlOrMeta+Enter');
  await expect(dialog).toBeHidden();
  const speaker = bat.locator('#live-speaker');
  await expect(speaker.getByRole('link', { name: /Created/ })).toBeVisible();
  await expect(speaker.getByRole('link', { name: /Created/ })).toBeFocused();
  const tasks = (p: Page) => p.getByRole('complementary', { name: 'Meeting notes' });
  await expect(tasks(bat).getByText('From Dorj’s blocker', { exact: false })).toBeVisible();
  await expect(tasks(anu).getByText('From Dorj’s blocker', { exact: false })).toBeVisible();

  // Notes autosave (Anu reads them live), then go to the standup page.
  await tasks(bat)
    .getByRole('textbox', { name: 'Meeting notes' })
    .fill('Bat renews the sandbox keys today');
  await expect(tasks(bat).getByText('Autosaved')).toBeVisible();
  await expect(tasks(anu).getByText('Bat renews the sandbox keys today')).toBeVisible();
  await bat.getByRole('button', { name: 'Save notes to standup' }).click();
  await expect(bat.getByText('Notes saved to the standup page.')).toBeVisible();

  await bat.getByRole('button', { name: 'End meeting' }).click();
  await expect(bat.getByRole('heading', { name: 'Meeting ended' })).toBeVisible();
  await expect(anu.getByRole('heading', { name: 'Meeting ended' })).toBeVisible();

  await anu.goto(`/w/kite-studio/standup/${group.id}`);
  const notes = anu.getByRole('region', { name: 'Meeting notes' });
  await expect(notes.getByText('Bat renews the sandbox keys today')).toBeVisible();
  await expect(notes.getByText('Payment provider sandbox API keys have expired')).toBeVisible();
  await expect(anu.getByRole('link', { name: 'Join live' })).toHaveCount(0);
  await bat.context().close();
});
