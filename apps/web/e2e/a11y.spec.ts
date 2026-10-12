import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, MEMBER } from './users';

/**
 * axe (WCAG 2.1 A/AA) on every screen and overlay, light and dark. A failure lists each rule,
 * the offending elements and axe's help link.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectAccessible(page: Page, what: string) {
  // Let entrance transitions and data settle (axe reads computed colors).
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations
    .map(
      (v) =>
        `• ${v.id} (${v.impact ?? 'n/a'}): ${v.help}\n  ${v.helpUrl}\n${v.nodes
          .slice(0, 6)
          .map(
            (n) =>
              `    ${n.target.join(' ')}\n      ${n.failureSummary?.replace(/\n/g, '\n      ') ?? ''}`,
          )
          .join('\n')}`,
    )
    .join('\n');
  expect.soft(violations, `${what}\n${report}`).toEqual([]);
}

interface Ids {
  project: string;
  space: string;
  emptyProject: string;
  taskKey: string;
}

async function lookup(page: Page): Promise<Ids> {
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    workspaces: { id: string }[];
  };
  const ws = me.workspaces[0]?.id ?? '';
  const sidebar = (await (await page.request.get(`/api/v1/workspaces/${ws}/sidebar`)).json()) as {
    spaces: { id: string; name: string; projects: { id: string; name: string }[] }[];
  };
  const projects = sidebar.spaces.flatMap((s) => s.projects);
  const app = projects.find((p) => p.name === 'App Redesign');
  const portal = projects.find((p) => p.name === 'Partner Portal');
  const space = sidebar.spaces.find((s) => s.projects.some((p) => p.id === app?.id));
  const tasks = (await (
    await page.request.get(`/api/v1/projects/${app?.id ?? ''}/tasks`)
  ).json()) as {
    key: string;
  }[];
  if (!app || !portal || !space || !tasks[0]) throw new Error('seed data missing');
  return { project: app.id, space: space.id, emptyProject: portal.id, taskKey: tasks[0].key };
}

const pages = (ids: Ids): [string, string][] => [
  ['My Tasks', '/my-tasks'],
  ['Inbox', '/inbox'],
  ['Settings', '/settings'],
  ['Settings · members', '/settings?tab=members'],
  ['Task page', `/t/${ids.taskKey}`],
  ['Project list', `/p/${ids.project}/list`],
  ['Project board', `/p/${ids.project}/board`],
  ['Project calendar', `/p/${ids.project}/calendar`],
  ['Space list', `/s/${ids.space}/list`],
  ['Space board', `/s/${ids.space}/board`],
  ['Space calendar', `/s/${ids.space}/calendar`],
  ['Reports · Overview', '/reports/overview'],
  ['Reports · Sprints', '/reports/sprints'],
  ['Reports · Workload', '/reports/workload'],
  ['Reports · People', '/reports/people'],
  ['Reports · empty', `/reports/overview?project=${ids.emptyProject}`],
];

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expectAccessible(page, 'Login');
  });

  test('invite (invalid link)', async ({ page }) => {
    await page.goto('/invite/not-a-real-token');
    await expect(page.getByRole('link')).toBeVisible();
    await expectAccessible(page, 'Invite');
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`admin · ${scheme}`, () => {
    test.use({ storageState: ADMIN.state, colorScheme: scheme });

    test('every screen', async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto('/my-tasks');
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      const ids = await lookup(page);
      for (const [name, url] of pages(ids)) {
        await test.step(name, async () => {
          await page.goto(url);
          await expect(page.locator('main')).toBeVisible();
          await expectAccessible(page, `${name} (${scheme})`);
        });
      }
    });

    test('overlays', async ({ page }) => {
      await page.goto('/my-tasks');
      const ids = await lookup(page);

      await test.step('task drawer', async () => {
        await page.goto(`/p/${ids.project}/list?task=${ids.taskKey}`);
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectAccessible(page, `Task drawer (${scheme})`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
      });

      await test.step('quick create', async () => {
        await page.locator('body').press('c');
        await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible();
        await expectAccessible(page, `Quick create (${scheme})`);
        await page.keyboard.press('Escape');
      });

      await test.step('command palette', async () => {
        await page.keyboard.press('ControlOrMeta+k');
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectAccessible(page, `Command palette (${scheme})`);
        await page.keyboard.press('Escape');
      });

      await test.step('shortcuts', async () => {
        await page.locator('body').press('Shift+?');
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectAccessible(page, `Shortcuts (${scheme})`);
        await page.keyboard.press('Escape');
      });

      await test.step('new sprint', async () => {
        await page.getByRole('button', { name: 'Project options' }).click();
        await page.getByRole('menuitem', { name: 'New sprint' }).click();
        await expect(page.getByRole('dialog', { name: 'New sprint' })).toBeVisible();
        await expectAccessible(page, `New sprint (${scheme})`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'New sprint' })).toBeHidden();
      });

      await test.step('new project', async () => {
        const add = page.getByRole('button', { name: /^New project in / }).first();
        const name = (await add.getAttribute('aria-label')) ?? '';
        await add.click();
        await expect(page.getByRole('dialog', { name })).toBeVisible();
        await expectAccessible(page, `New project (${scheme})`);
        await page.keyboard.press('Escape');
      });
    });
  });
}

test.describe('member', () => {
  test.use({ storageState: MEMBER.state });

  test('My performance', async ({ page }) => {
    await page.goto('/reports/me');
    await expect(page.locator('main')).toBeVisible();
    await expectAccessible(page, 'Reports · My performance');
  });
});
