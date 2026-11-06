import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { deletePushSubscription, savePushSubscription, usePushConfig } from '../api/push';
import { useAuth } from '../auth/useAuth';
import { toast } from '../stores/toast';
import { useUiStore } from '../stores/ui';
import {
  notificationPermission,
  pushSupport,
  subscribeBrowser,
  unsubscribeBrowser,
  type PushSupport,
} from './browser';

/**
 * What the "Push notifications on this device" switch can do here: `off` = the server has no
 * VAPID keys (the switch is hidden), `denied` = notifications are blocked for this site, `ready`
 * = it can be turned on or off.
 */
export type PushState = 'loading' | 'off' | Exclude<PushSupport, 'supported'> | 'denied' | 'ready';

/** Message the service worker posts to an open tab when a push is clicked. */
export const OPEN_MESSAGE = 'kite.push.open';

export function usePushSetting() {
  const { t } = useTranslation();
  const config = usePushConfig();
  const optIn = useUiStore((s) => s.pushOptIn);
  const setOptIn = useUiStore((s) => s.setPushOptIn);
  // Permission changes outside React (the browser prompt); re-read it after each toggle.
  const [permission, setPermission] = useState(notificationPermission);
  const support = pushSupport();

  const enable = useMutation({
    mutationFn: async (publicKey: string) => {
      const subscription = await subscribeBrowser(publicKey);
      setPermission(notificationPermission());
      if (!subscription) return false;
      await savePushSubscription(subscription);
      return true;
    },
    onSuccess: (subscribed) => {
      setOptIn(subscribed);
      // The prompt was dismissed or blocked: say why the switch didn't stay on.
      if (!subscribed) toast({ message: t('settings.notifications.push.notAllowed') });
    },
  });
  const disable = useMutation({
    mutationFn: async () => {
      const endpoint = await unsubscribeBrowser();
      if (endpoint) await deletePushSubscription(endpoint);
    },
    // Off here even if the server call failed: the browser no longer has the subscription.
    onSettled: () => {
      setOptIn(false);
    },
  });

  let state: PushState;
  if (config.isPending) state = 'loading';
  else if (!config.data?.enabled || !config.data.publicKey) state = 'off';
  else if (support !== 'supported') state = support;
  else if (permission === 'denied') state = 'denied';
  else state = 'ready';

  const publicKey = config.data?.publicKey ?? null;
  return {
    state,
    on: state === 'ready' && optIn && permission === 'granted',
    busy: enable.isPending || disable.isPending,
    setOn: (on: boolean) => {
      if (on && publicKey) enable.mutate(publicKey);
      else if (!on) disable.mutate();
    },
  };
}

/**
 * In the signed-in shell: re-saves this browser's subscription for the current session when the
 * person turned push on here (a new sign-in is a new session, and the old one's row went with
 * it), and opens what a clicked push points at in this tab.
 */
export function usePushSync() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const optIn = useUiStore((s) => s.pushOptIn);
  // Only people who turned push on here need the key (no request for everyone else).
  const config = usePushConfig(!!me && optIn);
  const publicKey = config.data?.enabled ? config.data.publicKey : null;
  const userId = me?.user.id;

  useEffect(() => {
    if (!userId || !optIn || !publicKey) return;
    if (pushSupport() !== 'supported' || notificationPermission() !== 'granted') return;
    void subscribeBrowser(publicKey)
      .then((subscription) => (subscription ? savePushSubscription(subscription) : null))
      .catch(() => {
        // Offline or the push service is unreachable: tried again on the next load.
      });
  }, [userId, optIn, publicKey]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (
        data?.type === OPEN_MESSAGE &&
        typeof data.url === 'string' &&
        /^\/(?!\/)/.test(data.url)
      ) {
        void navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [navigate]);
}
