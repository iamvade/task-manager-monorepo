import { pushConfigSchema, type PushSubscriptionInput } from '@kite/shared';
import { queryKeys } from '@kite/shared/client';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './client';

/** Whether the server sends Web Push (VAPID keys set) and the key to subscribe with. */
export function usePushConfig(enabled = true) {
  return useQuery({
    queryKey: queryKeys.pushConfig,
    queryFn: () => apiFetch('/push/config', pushConfigSchema),
    staleTime: Infinity,
    enabled,
  });
}

/** Saves this browser's subscription for the signed-in session. */
export const savePushSubscription = (subscription: PushSubscriptionInput) =>
  apiSend('/me/push-subscriptions', z.null(), 'PUT', subscription);

export const deletePushSubscription = (endpoint: string) =>
  apiSend('/me/push-subscriptions', z.null(), 'DELETE', { endpoint });
