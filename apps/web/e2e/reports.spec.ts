import { expect, test, type Locator, type Page } from '@playwright/test';
import { ADMIN, MEMBER } from './users';

/** "Dorj E., 5 tasks, 15 pts, Heavy" → 15. */
async function rowPoints(row: Locator): Promise<number> {
  const label = (await row.getAttribute('aria-label')) ?? '';
  const match = /, (\d+) pts?, /.exec(label);
  if (!match?.[1]) throw new Error(`No points in "${label}"`);
  return Number(match[1]);
}

/** Sum of the stacked bar's segment titles ("Overdue: 8 pts (2 tasks)") in a person row. */
async function barPoints(row: Locator): Promise<number> {
  const titles = await row
    .locator('[title]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));
  return titles.reduce((sum, title) => {
    const match = /^[^:]+: (\d+) pts? \(/.exec(title);
    return sum + (match?.[1] ? Number(match[1]) : 0);
  }, 0);
}

const personRows = (page: Page, load?: 'Heavy' | 'Light') =>
  page
    .getByRole('region', { name: 'Team workload' })
    .locator(load ? `button[aria-expanded][aria-label$=", ${load}"]` : 'button[aria-expanded]');

test.describe('admin', () => {
  test.use({ storageState: ADMIN.state });

  test('rebalances Workload: reassigning a Heavy person’s task updates both bars', async ({
    page,
  }) => {
    await page.goto('/reports/workload');
    const heavy = personRows(page, 'Heavy').first();
    const light = personRows(page, 'Light').first();
    await expect(heavy).toBeVisible();
    await expect(light).toBeVisible();

    const heavyLabel = (await heavy.getAttribute('aria-label')) ?? '';
    const lightLabel = (await light.getAttribute('aria-label')) ?? '';
    const heavyName = heavyLabel.split(',')[0] ?? '';
    const lightName = lightLabel.split(',')[0] ?? '';
    const heavyBefore = await rowPoints(heavy);
    const lightBefore = await rowPoints(light);
    expect(await barPoints(heavy)).toBe(heavyBefore);

    await heavy.click();
    await expect(heavy).toHaveAttribute('aria-expanded', 'true');

    // The first sized task of the Heavy person.
    const details = heavy.locator('xpath=following-sibling::*[1]');
    const sizedTask = details
      .locator('div.relative')
      .filter({ has: page.locator('[title="Size (points)"]') })
      .first();
    const size = Number(await sizedTask.locator('[title="Size (points)"]').innerText());
    expect(size).toBeGreaterThan(0);

    // Hand it over: add the Light person, then remove the Heavy one.
    await sizedTask.getByRole('button', { name: /^Reassign / }).click();
    const picker = page.getByRole('listbox', { name: 'Assignees' });
    await picker.getByRole('option', { name: new RegExp(`^${firstWord(lightName)}`) }).click();
    await picker.getByRole('option', { name: new RegExp(`^${firstWord(heavyName)}`) }).click();
    await page.keyboard.press('Escape');

    const heavyAfter = personRows(page).filter({ hasText: heavyName }).first();
    const lightAfter = personRows(page).filter({ hasText: lightName }).first();
    await expect(heavyAfter).toHaveAttribute(
      'aria-label',
      new RegExp(`, ${String(heavyBefore - size)} pts?, `),
    );
    await expect(lightAfter).toHaveAttribute(
      'aria-label',
      new RegExp(`, ${String(lightBefore + size)} pts?, `),
    );
    expect(await barPoints(heavyAfter)).toBe(heavyBefore - size);
    expect(await barPoints(lightAfter)).toBe(lightBefore + size);

    // Still true once the server's numbers replace the optimistic ones.
    await page.reload();
    await expect(personRows(page).filter({ hasText: lightName }).first()).toHaveAttribute(
      'aria-label',
      new RegExp(`, ${String(lightBefore + size)} pts?, `),
    );
  });

  test('Partner Portal shows the not-enough-history state', async ({ page }) => {
    await page.goto('/reports/overview');
    await page.getByRole('button', { name: /^Project/ }).click();
    await page.getByRole('option', { name: 'Partner Portal' }).click();
    await expect(
      page.getByRole('heading', { name: 'Reports appear after your team completes a few tasks' }),
    ).toBeVisible();
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
    await expect(progress).toHaveAttribute('aria-valuemax', '5');
    await expect(page.getByText('1 task completed so far · 4 more to go')).toBeVisible();
  });

  test('People: pick a person and read their report', async ({ page }) => {
    await page.goto('/reports/people');
    await expect(page.getByText('Visible to admins only')).toBeVisible();
    await page.getByRole('button', { name: /^Choose a person: / }).click();
    await page.getByRole('option', { name: /^Sara/ }).click();
    await expect(page).toHaveURL(/\/reports\/people\/[0-9a-f-]{36}/);
    await expect(page.getByRole('button', { name: /^Choose a person: Sara/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Current open tasks' })).toBeVisible();
  });
});

test.describe('member', () => {
  test.use({ storageState: MEMBER.state });

  test('opens Workload, and People redirects to My performance', async ({ page }) => {
    await page.goto('/reports/workload');
    await expect(page.getByRole('heading', { name: 'Team workload' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'People' })).toHaveCount(0);

    await page.goto('/reports/people');
    await expect(page).toHaveURL(/\/reports\/me$/);
    await expect(page.getByRole('heading', { name: 'Your last 4 weeks' })).toBeVisible();
    await expect(page.getByText('Visible only to you and workspace admins')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Export my data' })).toHaveAttribute(
      'href',
      /\/reports\/people\/me\.csv/,
    );
  });
});

function firstWord(name: string): string {
  return (name.split(' ')[0] ?? name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
