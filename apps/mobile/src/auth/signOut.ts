import { queryKeys } from '@kite/shared/client';
import { cachePersister } from '../api/persist';
import { queryClient } from '../api/queryClient';
import { clearSession } from '../api/session';
import { scopeUiStore } from '../stores/ui';

let signingOut: Promise<void> | null = null;

/**
 * Forgets the session on this device: the token, every cached query (memory and disk) and paused
 * writes. `me` becomes null first, so the route guards move to sign-in at once. Not `clear()`:
 * it drops `me` under its observers and the app would keep showing the user.
 */
export function signOut(): Promise<void> {
  signingOut ??= (async () => {
    try {
      await clearSession();
      void queryClient.cancelQueries();
      queryClient.setQueryData(queryKeys.me, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] });
      queryClient.getMutationCache().clear();
      await cachePersister.removeClient();
      scopeUiStore(null);
    } finally {
      signingOut = null;
    }
  })();
  return signingOut;
}
