import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/useAuth';
import { useUiStore } from '../../../stores/ui';
import { WorkspaceContext } from '../../../workspace/WorkspaceContext';

/**
 * Everything inside a workspace (`/w/:slug/...`, same paths as the web). A slug that isn't one
 * of my workspaces goes home (never saying whether it exists).
 */
export default function WorkspaceLayout() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me } = useAuth();
  const workspace = me?.workspaces.find((w) => w.slug === slug);
  const scoped = useUiStore((s) => me !== undefined && s.scopedTo === (me?.user.id ?? null));
  const lastId = useUiStore((s) => s.lastWorkspaceId);
  const setLast = useUiStore((s) => s.setLastWorkspace);

  // `/` opens the one used last; only once this user's saved state is loaded.
  useEffect(() => {
    if (workspace && scoped && workspace.id !== lastId) setLast(workspace.id);
  }, [workspace, scoped, lastId, setLast]);

  // Not mine: home. Otherwise the navigator renders from the first frame, also while `me` loads
  // or after sign-out (the root layout then moves to sign-in): a navigator mounted late, or torn
  // down early, leaves the router unable to navigate away.
  if (me && !workspace) return <Redirect href="/" />;
  return (
    <WorkspaceContext.Provider value={workspace ?? null}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="switcher"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
            title: t('workspace.switcherTitle'),
          }}
        />
      </Stack>
    </WorkspaceContext.Provider>
  );
}
