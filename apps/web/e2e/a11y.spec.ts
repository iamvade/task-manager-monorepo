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
  /** Mobile team (has posts) and Design team (empty state). */
  mobileGroup: string;
  designGroup: string;
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
  const groups = (await (
    await page.request.get(`/api/v1/workspaces/${ws}/standup-groups`)
  ).json()) as { id: string; name: string }[];
  const mobile = groups.find((g) => g.name === 'Mobile team');
  const design = groups.find((g) => g.name === 'Design team');
  if (!app || !portal || !space || !tasks[0] || !mobile || !design) {
    throw new Error('seed data missing');
  }
  return {
    project: app.id,
    space: space.id,
    emptyProject: portal.id,
    taskKey: tasks[0].key,
    mobileGroup: mobile.id,
    designGroup: design.id,
  };
}

const pages = (ids: Ids): [string, string][] => [
  ['My Tasks', '/my-tasks'],
  ['Inbox', '/inbox'],
  ['Settings', '/settings'],
  ['Settings · members', '/settings?tab=members'],
  ['Settings · tags', '/settings?tab=tags'],
  ['Settings · archived', '/settings?tab=archived'],
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
  ['Standup · group', `/standup/${ids.mobileGroup}`],
  ['Standup · empty group', `/standup/${ids.designGroup}`],
  ['Standup · settings', `/standup/${ids.mobileGroup}/settings`],
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
      test.setTimeout(120_000);
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

      await test.step('project brief and bulk bar', async () => {
        await page.goto(`/p/${ids.project}/list?sprint=none`);
        const brief = page.getByRole('button', { name: /^Project brief/ });
        await brief.click();
        await expect(brief).toHaveAttribute('aria-expanded', 'true');
        const boxes = page.getByRole('checkbox', { name: /^Select / });
        await boxes.nth(0).check();
        await boxes.nth(1).check();
        await expect(page.getByRole('toolbar', { name: /selected task/ })).toBeVisible();
        await expectAccessible(page, `Brief + bulk bar (${scheme})`);
        await page.getByRole('button', { name: 'Clear selection' }).click();
        await brief.click();
      });

      await test.step('drawer with followers and Mentioned in', async () => {
        await page.goto(`/p/${ids.project}/list?sprint=none&task=APP-142`);
        await expect(page.getByRole('region', { name: 'Mentioned in' })).toBeVisible();
        await expectAccessible(page, `Drawer · Mentioned in (${scheme})`);
        await page.keyboard.press('Escape');
      });

      await test.step('standup: group switcher, member menu, new group, time off', async () => {
        await page.goto(`/standup/${ids.mobileGroup}`);
        await page.getByRole('button', { name: /^Switch standup group/ }).click();
        await expect(page.getByRole('listbox')).toBeVisible();
        await expectAccessible(page, `Standup group switcher (${scheme})`);
        await page.keyboard.press('Escape');

        await page.goto(`/standup/${ids.mobileGroup}/settings`);
        await page.getByRole('button', { name: 'Add members' }).click();
        await expect(page.getByRole('listbox')).toBeVisible();
        await expectAccessible(page, `Standup add members (${scheme})`);
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: 'New standup group' }).click();
        await expect(page.getByRole('textbox', { name: 'Group name' }).last()).toBeVisible();
        await expectAccessible(page, `New standup group (${scheme})`);
        await page.keyboard.press('Escape');

        await page.goto('/settings?tab=members');
        await page.getByRole('button', { name: /^More actions for Mia/ }).click();
        await page.getByRole('menuitem', { name: 'Set out of office…' }).click();
        await expect(page.getByRole('dialog', { name: /^Out of office/ })).toBeVisible();
        await expectAccessible(page, `Time off dialog (${scheme})`);
        await page.keyboard.press('Escape');
      });

      await test.step('tags: new tag form, merge and delete dialogs', async () => {
        await page.goto('/settings?tab=tags');
        await page.getByRole('button', { name: 'New tag' }).click();
        await page.getByRole('textbox', { name: 'Tag name' }).fill('Ops');
        await expectAccessible(page, `New tag form (${scheme})`);
        await page.getByRole('button', { name: 'Cancel' }).click();

        await page.getByRole('button', { name: 'Actions for UX' }).click();
        await page.getByRole('menuitem', { name: 'Merge into…' }).click();
        const merge = page.getByRole('dialog', { name: 'Merge “UX”' });
        await merge.getByRole('button', { name: 'Merge into' }).click();
        await page.getByRole('option', { name: /^UI/ }).click();
        await expect(merge.getByText(/Tasks tagged “UX” get “UI” instead/)).toBeVisible();
        await expectAccessible(page, `Merge tag dialog (${scheme})`);
        await merge.getByRole('button', { name: 'Cancel' }).click();
        await expect(merge).toBeHidden();

        await page.getByRole('button', { name: 'Actions for UX' }).click();
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        const remove = page.getByRole('dialog', { name: 'Delete “UX”?' });
        await expect(remove.getByText(/removed from \d+ tasks?/)).toBeVisible();
        await expectAccessible(page, `Delete tag dialog (${scheme})`);
        await remove.getByRole('button', { name: 'Cancel' }).click();
        await expect(remove).toBeHidden();
      });

      await test.step('deactivate dialog', async () => {
        await page.goto('/settings?tab=members');
        await page.getByRole('button', { name: 'More actions for Dorj E.' }).click();
        await page.getByRole('menuitem', { name: 'Deactivate…' }).click();
        const dialog = page.getByRole('dialog', { name: 'Deactivate Dorj E.?' });
        await expect(dialog.getByText(/open tasks? assigned/)).toBeVisible();
        await expectAccessible(page, `Deactivate dialog (${scheme})`);
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
      });
    });
  });
}

test.describe('member', () => {
  test.use({ storageState: MEMBER.state });

  test('Settings · tags (read-only)', async ({ page }) => {
    await page.goto('/settings?tab=tags');
    await expect(page.getByText(/Only admins and owners can create/)).toBeVisible();
    await expectAccessible(page, 'Settings · tags (member)');
  });

  test('My performance', async ({ page }) => {
    await page.goto('/reports/me');
    await expect(page.locator('main')).toBeVisible();
    await expectAccessible(page, 'Reports · My performance');
  });
});
