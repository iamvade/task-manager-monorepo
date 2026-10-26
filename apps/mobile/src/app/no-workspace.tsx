import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useLogout } from '../api/auth';
import { useAuth } from '../auth/useAuth';
import { AuthScreen } from '../components/AuthScreen';
import { Button } from '../components/form/Button';
import { useTheme } from '../theme/ThemeProvider';

/** Signed in but in no workspace (also the platform admin, who is never a member). */
export default function NoWorkspace() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { me, refetch, isFetching } = useAuth();
  const logout = useLogout();

  if (me === null) return <Redirect href="/sign-in" />;
  // An invite arrived meanwhile ("Check again"): `/` opens it.
  if (me && me.workspaces.length > 0) return <Redirect href="/" />;
  const avatar = me ? theme.palette.avatar[me.user.avatarColor][theme.scheme] : null;

  return (
    <AuthScreen
      title={t('workspace.noneTitle')}
      subtitle={t('workspace.noneBody', { email: me?.user.email ?? '' })}
    >
      {me && avatar ? (
        <View style={[styles.chip, { backgroundColor: theme.mobile.fill }]}>
          <View style={[styles.avatar, { backgroundColor: avatar.bg }]}>
            <Text style={[styles.initials, { color: avatar.fg, fontFamily: theme.fontFor(600) }]}>
              {me.user.initials}
            </Text>
          </View>
          <Text
            style={[theme.type.meta, { color: theme.colors.text2, fontFamily: theme.fontFor(500) }]}
          >
            {me.user.email}
          </Text>
        </View>
      ) : null}
      <Button label={t('workspace.checkAgain')} busy={isFetching} onPress={refetch} />
      <Button
        variant="secondary"
        label={t('workspace.signOut')}
        busy={logout.isPending}
        onPress={() => {
          logout.mutate();
        }}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 12,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 10, lineHeight: 12 },
});
