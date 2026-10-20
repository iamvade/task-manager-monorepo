import type { MeResponse, TaskBlocked } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthContext } from '../../auth/useAuth';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { ME } from '../../test/fixtures';
import { DORJ_REF, MOBILE_ID } from '../../test/standup';
import { makeTask } from '../../test/tasks';
import { TaskCard } from '../board/TaskCard';
import { BlockedPill, BlockedValue } from './BlockedMarker';

const BLOCKED: TaskBlocked = {
  groupId: MOBILE_ID,
  groupName: 'Mobile team',
  date: '2026-10-08',
  text: 'Waiting on final tab icons',
  fromUser: { ...DORJ_REF, name: 'Temuulen G.' },
};
const REDACTED: TaskBlocked = { ...BLOCKED, text: null, fromUser: null };

function wrap(children: ReactNode) {
  const me = { ...ME, preferences: { ...ME.preferences, locale: 'en' } } as MeResponse;
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthContext.Provider value={{ me, isError: false, error: null }}>
        <MemoryRouter>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('Blocked marker', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('links the List pill to the standup day, with the blocker as its tooltip', () => {
    wrap(<BlockedPill blocked={BLOCKED} />);
    const pill = screen.getByRole('link', {
      name: 'Blocked: Waiting on final tab icons — from Temuulen’s standup, Oct 8',
    });
    expect(pill).toHaveAttribute('href', `/w/kite-studio/standup/${MOBILE_ID}/2026-10-08`);
    expect(pill).toHaveTextContent('Blocked');
  });

  it('names the group instead of the text for people outside it', () => {
    wrap(<BlockedPill blocked={REDACTED} />);
    expect(
      screen.getByRole('link', { name: 'Blocked: Blocked · from Mobile team’s standup, Oct 8' }),
    ).toBeVisible();
  });

  it('shows the Board row on open tasks only and turns the card border', () => {
    const open = { ...makeTask('Implement new bottom tab bar', 'in_progress'), blocked: BLOCKED };
    const done = { ...makeTask('Shipped thing', 'done'), blocked: BLOCKED };
    wrap(
      <>
        <TaskCard task={open} href="/x" />
        <TaskCard task={done} href="/y" />
      </>,
    );
    const row = screen.getByText('Waiting on final tab icons', { exact: false });
    expect(row.closest('span[title]')).toHaveAttribute('title', 'From Temuulen’s standup, Oct 8');
    expect(screen.getAllByText('Blocked')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Implement new bottom tab bar/ })).toHaveClass(
      'border-blocked',
    );
  });

  it('shows the drawer line with a link to the standup', () => {
    wrap(<BlockedValue blocked={BLOCKED} />);
    expect(screen.getByText('Waiting on final tab icons')).toBeVisible();
    expect(screen.getByRole('link', { name: 'From Temuulen’s standup, Oct 8' })).toHaveAttribute(
      'href',
      `/w/kite-studio/standup/${MOBILE_ID}/2026-10-08`,
    );
  });
});
