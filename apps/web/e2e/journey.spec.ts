import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ADMIN, PASSWORD, SARA } from './users';

/** UI strings, so assertions follow the translation files instead of hard-coded copy. */
const strings = (lang: 'en' | 'mn') =>
  JSON.parse(
    readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'),
  ) as {
    shell: { myTasks: string; inbox: string; reports: string; settings: string };
    inbox: { tabs: Record<'all' | 'mentions' | 'assigned' | 'archived', string> };
    status: Record<'todo' | 'review', string>;
    myTasks: { feed: { mentioned: string } };
  };
const EN = strings('en');
const MN = strings('mn');

/** "<b>{{actor}}</b> mentioned you in <task>{{task}}</task>" → the words around the names. */
const mentionWords = (template: string) =>
  template
    .replace(/<b>\{\{actor\}\}<\/b>/, '')
    .split(/<task>\{\{task\}\}<\/task>/)
    .map((part) => part.trim())
    .filter(Boolean);

const column = (page: Page, status: string) =>
  page.getByRole('region', { name: new RegExp(`^${status}, \\d+ tasks?$`) });

/** A project's id, looked up through the API with the page's session. */
async function projectId(page: Page, name: string): Promise<string> {
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    workspaces: { id: string; slug: string }[];
  };
  const ws = me.workspaces.find((w) => w.slug === 'kite-studio')?.id ?? '';
  const sidebar = (await (await page.request.get(`/api/v1/workspaces/${ws}/sidebar`)).json()) as {
    spaces: { projects: { id: string; name: string }[] }[];
  };
  const project = sidebar.spaces.flatMap((s) => s.projects).find((p) => p.name === name);
  if (!project) throw new Error(`No project "${name}"`);
  return project.id;
}

/** Pointer drag with intermediate moves: dnd-kit's PointerSensor starts after 4px. */
async function drag(page: Page, from: Locator, to: Locator) {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('drag: element not visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 20 });
  await page.mouse.move(b.x + b.width / 2, b.y + 90, { steps: 5 });
  await page.mouse.up();
}

test.describe('task → board → mention → inbox', () => {
  test.use({ storageState: ADMIN.state });

  test('Anu creates a task, moves it to In Review and mentions Sara; Sara sees it in her inbox', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const title = `E2E journey ${Date.now()}`;

    // 1. Create the task from the quick-create modal (C), in App Redesign.
    const project = `/w/kite-studio/p/${await projectId(page, 'App Redesign')}`;
    await page.goto(`${project}/list`);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(
      'App Redesign',
    );
    await expect(page.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
    await page.locator('body').press('c');
    const modal = page.getByRole('dialog', { name: 'New task' });
    await expect(modal).toBeVisible();
    await modal.getByPlaceholder('Task title').fill(title);
    await expect(modal.getByRole('button', { name: /App Redesign/ })).toBeVisible();
    await modal.getByRole('button', { name: 'Create task' }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByText(/Created [A-Z0-9]+-\d+/)).toBeVisible();

    // 2. Drag it on the board from To Do to In Review; the move survives a reload. The board
    // opens on the current sprint, which the new task isn't in: `sprint=none` shows them all.
    await page.goto(`${project}/board?sprint=none`);
    const card = column(page, EN.status.todo).getByRole('link', { name: new RegExp(title) });
    await expect(card).toBeVisible();
    await drag(page, card, column(page, EN.status.review));
    const inReview = column(page, EN.status.review).getByRole('link', { name: new RegExp(title) });
    await expect(inReview).toBeVisible();
    await page.reload();
    await expect(inReview).toBeVisible();
    await expect(
      column(page, EN.status.todo).getByRole('link', { name: new RegExp(title) }),
    ).toHaveCount(0);

    // 3. Open the drawer.
    await inReview.click();
    await expect(page).toHaveURL(/[?&]task=[A-Z0-9]+-\d+/);
    const key = new URL(page.url()).searchParams.get('task') ?? '';
    const drawer = page.getByRole('dialog', { name: new RegExp(key) });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('textbox', { name: 'Task title' })).toHaveValue(title);

    // 4. Comment with an @mention of Sara.
    const composer = drawer.getByRole('textbox', { name: 'Write a comment' });
    await composer.click();
    await composer.pressSequentially('Please review @Sar');
    const suggestions = page.getByRole('listbox', { name: /mention/i });
    await expect(suggestions).toBeVisible();
    await suggestions.getByRole('option', { name: /Sara K/ }).click();
    await composer.pressSequentially(' thanks');
    await drawer.getByRole('button', { name: 'Comment', exact: true }).click();
    // The composer empties; the posted comment shows the mention chip.
    await expect(composer).not.toContainText('Please review');
    await expect(drawer.getByText(/Please review/)).toBeVisible();
    await expect(drawer.locator('.mention', { hasText: '@Sara K.' })).toBeVisible();

    // 5. Sara signs in (her own browser) and finds the notification, in Mongolian first.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const sara = await context.newPage();
    await sara.goto('/login');
    await sara.locator('input[name="email"]').fill(SARA.email);
    await sara.locator('input[name="password"]').fill(PASSWORD);
    await sara.locator('button[type="submit"]').click();
    await expect(sara).toHaveURL(/\/my-tasks/);

    const nav = sara.getByRole('navigation').first();
    await nav.getByRole('radio', { name: 'МН' }).click();
    await expect(nav.getByRole('link', { name: new RegExp(MN.shell.inbox) })).toBeVisible();
    await expect(sara.locator('html')).toHaveAttribute('lang', 'mn');
    await nav.getByRole('link', { name: new RegExp(MN.shell.inbox) }).click();
    await expect(sara).toHaveURL(/\/inbox/);

    const row = sara.getByRole('listitem').filter({ hasText: title });
    await expect(row).toBeVisible();
    for (const words of mentionWords(MN.myTasks.feed.mentioned)) {
      await expect(row).toContainText(words);
    }
    await expect(row).toContainText('Please review');
    await expect(sara.getByRole('tab', { name: MN.inbox.tabs.mentions })).toBeVisible();

    // 6. Switch to English: labels follow, and the choice sticks after a reload.
    await nav.getByRole('radio', { name: 'EN' }).click();
    await expect(sara.locator('html')).toHaveAttribute('lang', 'en');
    for (const label of [EN.shell.myTasks, EN.shell.inbox, EN.shell.reports, EN.shell.settings]) {
      await expect(nav.getByRole('link', { name: new RegExp(label) }).first()).toBeVisible();
    }
    for (const tab of Object.values(EN.inbox.tabs)) {
      await expect(sara.getByRole('tab', { name: tab })).toBeVisible();
    }
    for (const words of mentionWords(EN.myTasks.feed.mentioned)) {
      await expect(row).toContainText(words);
    }
    await sara.reload();
    await expect(sara.getByRole('tab', { name: EN.inbox.tabs.mentions })).toBeVisible();
    await expect(nav.getByRole('radio', { name: 'EN' })).toHaveAttribute('aria-checked', 'true');

    // Opening the notification lands on the task.
    await sara.getByRole('listitem').filter({ hasText: title }).getByRole('button').first().click();
    await expect(sara).toHaveURL(new RegExp(`task=${key}|/t/${key}`));
    await context.close();
  });
});
