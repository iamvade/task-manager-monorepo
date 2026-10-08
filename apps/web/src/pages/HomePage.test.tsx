import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../queryClient';
import { HomePage } from './HomePage';

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <HomePage />
    </QueryClientProvider>,
  );
}

describe('HomePage', () => {
  it('shows that the API is reachable', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ status: 'ok', db: 'up', time: '2026-10-08T09:00:00.000Z' }),
      );

    renderPage();

    expect(await screen.findByText('API холбогдсон')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health', expect.anything());
  });
});
