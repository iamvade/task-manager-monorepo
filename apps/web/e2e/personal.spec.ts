import { expect, test, type Page } from '@playwright/test';
import { ADMIN, MEMBER } from './users';

test.use({ storageState: ADMIN.state });

interface Item {
  id: string;
  title: string;
  doneAt: string | null;
}

async function createItem(page: Page, origin: string, body: object): Promise<Item> {
  const res = await page.request.post('/api/v1/me/personal/items', {
    headers: { origin },
    data: body,
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as Item;
}

/**
 * Personal space: a note links another with `[[…]]` typed in the editor, the target lists it
 * under "Linked from", a to-do is checked off from the list, and a teammate can't open the note.
 */
test('notes link with [[…]], show backlinks, and stay private', async ({
  page,
  baseURL,
  browser,
}) => {
  const origin = baseURL ?? '';
  const stamp = String(Date.now());
  const target = await createItem(page, origin, { title: `Roadmap ${stamp}` });
  const source = await createItem(page, origin, { title: `Weekly review ${stamp}` });

  // Type a link in the source note; the closing ]] links the existing note by title.
  await page.goto(`/w/kite-studio/personal/i/${source.id}`);
  const editor = page.locator('[role="textbox"][aria-multiline="true"]');
  await editor.click();
  await editor.pressSequentially(`Read [[Roadmap ${stamp}]] first`);
  await expect(editor.locator('[data-type="item-link"]')).toHaveText(`Roadmap ${stamp}`);
  await page.locator('#personal-title').click();
  await expect(
    page.locator('section[aria-labelledby="personal-body-h"]').getByRole('status'),
  ).toContainText(/Saved/);

  // The target lists the source under "Linked from".
  await page.goto(`/w/kite-studio/personal/i/${target.id}`);
  const backlinks = page.locator('section[aria-labelledby="personal-backlinks-h"]');
  await expect(backlinks.getByRole('link', { name: `Weekly review ${stamp}` })).toBeVisible();

  // A to-do checked off in the list.
  const todo = await createItem(page, origin, { kind: 'todo', title: `Call the bank ${stamp}` });
  await page.goto('/w/kite-studio/personal?view=todos');
  const box = page.getByRole('checkbox', { name: `Mark “Call the bank ${stamp}” done` });
  await box.click();
  await expect(box).toBeChecked();
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/v1/me/personal/items/${todo.id}`);
      return ((await res.json()) as Item).doneAt;
    })
    .not.toBeNull();

  // A teammate gets "not found" for the same note.
  const dorj = await browser.newContext({ storageState: MEMBER.state });
  const other = await dorj.newPage();
  expect((await other.request.get(`/api/v1/me/personal/items/${source.id}`)).status()).toBe(404);
  await other.goto(`/w/kite-studio/personal/i/${source.id}`);
  await expect(other.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await dorj.close();
});
