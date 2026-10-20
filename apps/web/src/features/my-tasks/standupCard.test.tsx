import type { MeResponse, StandupGroup } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthContext } from '../../auth/useAuth';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { ME, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { DESIGN, DESIGN_ID, MOBILE, MOBILE_ID, dayOf } from '../../test/standup';
import { StandupCard } from './StandupCard';

function renderCard(groups: StandupGroup[]) {
  mockApi({
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/standup-groups`]: () => Response.json(groups),
    [`GET /api/v1/standup-groups/${MOBILE_ID}/days/today`]: () => Response.json(dayOf()),
    [`GET /api/v1/standup-groups/${DESIGN_ID}/days/today`]: () =>
      Response.json(dayOf({ group: DESIGN, postedCount: 0, expectedCount: 2, members: [] })),
  });
  const me = { ...ME, preferences: { ...ME.preferences, locale: 'en' } } as MeResponse;
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthContext.Provider value={{ me, isError: false, error: null }}>
        <MemoryRouter>
          <StandupCard workspaceId={WORKSPACE_ID} />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('My Tasks standup card', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('asks for my update in the one group waiting for it', async () => {
    renderCard([MOBILE, { ...DESIGN, myPosted: true }]);
    const card = await screen.findByRole('region', { name: 'Post your standup update' });
    expect(
      await within(card).findByText('Mobile team · due by 10:00 · 2 of 3 have posted'),
    ).toBeVisible();
    expect(
      within(card).getByRole('img', { name: 'Posted: Sara, Dorj. Not yet: you.' }),
    ).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Write update' })).toHaveAttribute(
      'href',
      `/w/kite-studio/standup/${MOBILE_ID}?write=1`,
    );
    expect(within(card).getByRole('link', { name: 'See team updates' })).toHaveAttribute(
      'href',
      `/w/kite-studio/standup/${MOBILE_ID}`,
    );
  });

  it('lists several waiting groups in one card', async () => {
    renderCard([MOBILE, { ...DESIGN, myPosted: false }]);
    const card = await screen.findByRole('region', { name: 'Post your standup update' });
    expect(within(card).getByText('Mobile team')).toBeVisible();
    expect(within(card).getByText('Design team')).toBeVisible();
    expect(within(card).getAllByRole('link', { name: 'Write update' })).toHaveLength(2);
  });

  it('is hidden once I posted, on days without a standup, and outside groups', async () => {
    const { container } = renderCard([
      { ...MOBILE, myPosted: true },
      { ...DESIGN, meetsToday: false, myPosted: false },
      { ...DESIGN, id: '01890000-0000-7000-8000-000000000a03', isMember: false, myPosted: false },
    ]);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
});
