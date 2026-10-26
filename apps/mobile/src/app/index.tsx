import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useAuth } from '../auth/useAuth';
import { AuthScreen } from '../components/AuthScreen';
import { Button } from '../components/form/Button';
import { useUiStore } from '../stores/ui';
import { useTheme } from '../theme/ThemeProvider';

/** `/`: sign in, "No workspace yet", or the last used workspace's My Tasks (else the first). */
export default function Index() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { me, unreachable, refetch } = useAuth();
  const lastId = useUiStore((s) => s.lastWorkspaceId);
  const scopedTo = useUiStore((s) => s.scopedTo);

  if (me === null) return <Redirect href="/sign-in" />;
  if (me === undefined && unreachable) {
    // First launch offline (nothing cached): there is no session to show yet.
    return (
      <AuthScreen title={t('auth.signInTitle')} subtitle={t('errors.network')}>
        <Button variant="secondary" label={t('common.retry')} onPress={refetch} />
      </AuthScreen>
    );
  }
  // Wait for the user and their saved state (the last workspace).
  if (me === undefined || scopedTo !== me.user.id) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }
  const workspace = me.workspaces.find((w) => w.id === lastId) ?? me.workspaces[0];
  if (!workspace) return <Redirect href="/no-workspace" />;
  return <Redirect href={{ pathname: '/w/[slug]/my-tasks', params: { slug: workspace.slug } }} />;
}
