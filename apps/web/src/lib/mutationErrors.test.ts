import { MutationObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import i18n from '../i18n';
import { createQueryClient } from '../queryClient';
import { useToastStore } from '../stores/toast';
import { reportError } from './mutationErrors';

const messages = () => useToastStore.getState().toasts.map((t) => t.message);
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function fail(
  error: unknown,
  options: { meta?: { errorToast?: boolean }; report?: string } = {},
) {
  const observer = new MutationObserver(createQueryClient(), {
    mutationFn: () => Promise.reject(error instanceof Error ? error : new Error('x')),
    meta: options.meta,
  });
  await observer.mutate().catch((err: unknown) => {
    if (options.report) reportError(err, options.report);
  });
  await tick();
}

describe('mutation error toasts', () => {
  beforeEach(async () => {
    useToastStore.setState({ toasts: [] });
    await i18n.changeLanguage('en');
  });

  it('shows a toast per failed write, worded by error code', async () => {
    await fail(new ApiError(403, 'FORBIDDEN', 'nope'));
    await fail(new TypeError('Failed to fetch'));
    await fail(new ApiError(500, 'INTERNAL', 'boom'));
    expect(messages()).toEqual([
      'You don’t have permission to do that.',
      'Can’t reach the server. Check your connection and try again.',
      'Something went wrong. Please try again.',
    ]);
  });

  it('skips errors the UI shows itself', async () => {
    await fail(new ApiError(409, 'ALREADY_MEMBER', 'x'), { meta: { errorToast: false } });
    await fail(new ApiError(500, 'INTERNAL', 'x'), { report: 'Couldn’t move the task' });
    expect(messages()).toEqual(['Couldn’t move the task']);
  });
});
