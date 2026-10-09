import type { MeResponse, UpdateMe } from '@kite/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { meQueryKey, useUpdateMe } from './auth';

/** `me` with a `PATCH /me` body applied, as the server will return it. */
function applyUpdate(me: MeResponse, update: UpdateMe): MeResponse {
  const { name, avatarColor, notificationPrefs, ...preferences } = update;
  return {
    ...me,
    user: {
      ...me.user,
      ...(name === undefined ? {} : { name }),
      ...(avatarColor === undefined ? {} : { avatarColor }),
    },
    preferences: {
      ...me.preferences,
      ...preferences,
      notificationPrefs: { ...me.preferences.notificationPrefs, ...notificationPrefs },
    },
  };
}

/**
 * Saves profile fields and preferences optimistically: the cached profile changes at once (so
 * AuthProvider re-applies theme, accent and language) and rolls back if the save fails. A new
 * name or color refreshes the places that show my avatar.
 */
export function useSaveMe() {
  const { me } = useAuth();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();

  return (update: UpdateMe) => {
    if (!me) return;
    const previous = me;
    queryClient.setQueryData(meQueryKey, applyUpdate(me, update));
    updateMe.mutate(update, {
      onError: () => queryClient.setQueryData(meQueryKey, previous),
      onSuccess: () => {
        if (update.name !== undefined || update.avatarColor !== undefined) {
          void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
          void queryClient.invalidateQueries({ queryKey: ['projects'] });
          void queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
      },
    });
  };
}
