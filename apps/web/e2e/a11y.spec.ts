import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, MEMBER } from './users';

/**
 * axe (WCAG 2.1 A/AA) on every screen and overlay, light and dark. A failure lists each rule,
 * the offending elements and axe's help link.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
/** A 1×1 PNG, uploaded to check the image preview. */
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
  /** The group's local date (live mode's URL). */
  mobileToday: string;
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
  ).json()) as { id: string; name: string; today: string }[];
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
    mobileToday: mobile.today,
    designGroup: design.id,
  };
}

const pages = (ids: Ids): [string, string][] => [
  ['My Tasks', '/my-tasks'],
  ['Inbox', '/inbox'],
  ['Settings', '/settings'],
  ['Settings · members', '/settings?tab=members'],
  ['Settings · tags', '/settings?tab=tags'],
  ['Settings · sprints', '/settings?tab=sprints'],
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
  // Anu follows (Bat facilitates); the running meeting is checked in standup-live.spec.ts.
  ['Standup · live', `/standup/${ids.mobileGroup}/${ids.mobileToday}/live`],
  ['Feedback', '/feedback'],
  ['Feedback · filtered', '/feedback?type=bug&status=linked&status=new'],
];

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expectAccessible(page, 'Login');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`public feedback form (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      // Signed out, the page is in the default language (Mongolian): find things by id.
      await page.goto('/feedback/kite-studio');
      const send = page.locator('form button[type="submit"]');
      await expect(send).toBeVisible();
      await expectAccessible(page, `Public feedback form (${scheme})`);
      // Every field error and the summary.
      await send.click();
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expectAccessible(page, `Public feedback errors (${scheme})`);
    });
  }

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

      await test.step('feedback panel, link picker and create task', async () => {
        await page.goto('/feedback?item=FB-1042');
        const panel = page.getByRole('dialog', { name: 'Feedback FB-1042' });
        await expect(panel.getByRole('heading', { level: 1 })).toBeVisible();
        await expectAccessible(page, `Feedback panel (${scheme})`);
        await panel.getByRole('button', { name: 'Link to existing task' }).click();
        await expect(panel.getByRole('listbox')).toBeVisible();
        await expectAccessible(page, `Feedback link picker (${scheme})`);
        await panel.getByRole('button', { name: 'Create task from feedback' }).click();
        const modal = page.getByRole('dialog', { name: 'Create task from feedback' });
        await expect(modal).toBeVisible();
        await expectAccessible(page, `Create task from feedback (${scheme})`);
        await page.keyboard.press('Escape');
        await expect(modal).toBeHidden();
      });

      await test.step('feedback duplicates and bulk bar', async () => {
        await page.goto('/feedback?item=FB-1044');
        await expect(page.getByRole('note')).toBeVisible();
        await expectAccessible(page, `Feedback duplicates (${scheme})`);
        await page.goto('/feedback');
        await page
          .getByRole('checkbox', { name: /^Select: / })
          .first()
          .check();
        await expect(
          page.getByRole('toolbar', { name: 'Actions for selected rows' }),
        ).toBeVisible();
        await expectAccessible(page, `Feedback bulk bar (${scheme})`);
      });

      await test.step('image preview', async () => {
        await page.goto(`/p/${ids.project}/list?task=${ids.taskKey}`);
        const drawer = page.getByRole('dialog');
        const name = `a11y-preview-${scheme}.png`;
        const section = drawer.getByRole('region', { name: 'Attachments' });
        await section.locator('input[type="file"]').setInputFiles({
          name,
          mimeType: 'image/png',
          buffer: Buffer.from(PIXEL_PNG, 'base64'),
        });
        await section.getByRole('link', { name: new RegExp(name) }).click();
        const preview = page.getByRole('dialog', { name: `Preview of ${name}` });
        await expect(preview.getByRole('img', { name })).toBeVisible();
        await expectAccessible(page, `Image preview (${scheme})`);
        await page.keyboard.press('Escape');
        await expect(preview).toBeHidden();
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

      await test.step('row status picker', async () => {
        await page
          .getByRole('button', { name: /^Status of / })
          .first()
          .click();
        await expect(page.getByRole('listbox')).toBeVisible();
        await expectAccessible(page, `Row status picker (${scheme})`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('listbox')).toBeHidden();
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

        // The group page: reactions, the @-popup of a reply, the write modal, a past day.
        await page.goto(`/standup/${ids.mobileGroup}`);
        const card = page.getByRole('article').first();
        await expect(card).toBeVisible();
        const addReaction = card.getByRole('button', { name: 'Add reaction' });
        if (await addReaction.count()) {
          await addReaction.click();
          await expectAccessible(page, `Standup add reaction (${scheme})`);
          await page.keyboard.press('Escape');
        }
        await card.getByRole('combobox', { name: 'Reply' }).fill('@');
        await expect(page.getByRole('listbox', { name: 'Mention suggestions' })).toBeVisible();
        await expectAccessible(page, `Standup reply mentions (${scheme})`);
        await card.getByRole('combobox', { name: 'Reply' }).fill('');
        const write = page.getByRole('link', { name: /^(Write|Edit) update$/ }).first();
        if (await write.count()) {
          await write.click();
          await expect(page.getByRole('dialog', { name: 'Your standup' })).toBeVisible();
          await expect(page.getByRole('group', { name: /^Today/ })).toBeVisible();
          await expectAccessible(page, `Standup write modal (${scheme})`);
          // Nothing changed: closing saves no draft.
          await page.keyboard.press('Escape');
        }
        await page.getByRole('link', { name: 'Previous day' }).click();
        await expect(page.getByRole('heading', { name: 'Updates', exact: true })).toBeVisible();
        await expectAccessible(page, `Standup past day (${scheme})`);

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

      await test.step('sprints: edit dialog', async () => {
        await page.goto('/settings?tab=sprints');
        await page.getByRole('button', { name: 'Actions for Sprint 14' }).click();
        await page.getByRole('menuitem', { name: 'Edit sprint' }).click();
        await expect(page.getByRole('dialog', { name: 'Edit sprint' })).toBeVisible();
        await expectAccessible(page, `Edit sprint dialog (${scheme})`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Edit sprint' })).toBeHidden();
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

    test('phone (390×844)', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/my-tasks');
      const ids = await lookup(page);

      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('dialog', { name: 'Workspace' })).toBeVisible();
      await expectAccessible(page, `Phone navigation (${scheme})`);
      await page.keyboard.press('Escape');

      await page.goto('/feedback/kite-studio');
      await expect(page.locator('form button[type="submit"]')).toBeVisible();
      await expectAccessible(page, `Phone public feedback form (${scheme})`);

      await page.goto(`/standup/${ids.mobileGroup}`);
      await expect(page.getByRole('region', { name: 'Who has posted' })).toBeVisible();
      await expectAccessible(page, `Phone standup group (${scheme})`);

      // The write page from the reminder link (Design team: Anu hasn't posted there).
      await page.goto(`/standup/${ids.designGroup}?write=1`);
      const dialog = page.getByRole('dialog', { name: 'Your standup' });
      // No dialog on days without a standup.
      const open = await dialog
        .waitFor({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (open) {
        await expect(dialog.getByRole('group', { name: /^Today/ })).toBeVisible();
        await expectAccessible(page, `Phone write page (${scheme})`);
        // Nothing changed: closing saves no draft.
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      }
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
