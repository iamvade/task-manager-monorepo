import type { RealtimeLifecycle } from '@kite/shared/client';

/**
 * The browser's side of the realtime socket: back online or visible again → reconnect now;
 * leaving the page (or entering the back/forward cache, where an open socket would keep me
 * "online" and "viewing" a task I left) → close, reopened if the page is restored.
 */
export const webLifecycle: RealtimeLifecycle = ({ resume, suspend }) => {
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) resume();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') resume();
  };
  window.addEventListener('online', resume);
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', resume);
    window.removeEventListener('pagehide', suspend);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', onVisible);
  };
};
