import { switchTarget } from '@kite/shared';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLogout } from '../../../api/auth';
import { useUnreadCounts } from '../../../api/notifications';
import { useAuth } from '../../../auth/useAuth';
import { Button } from '../../../components/form/Button';
import { TextField } from '../../../components/form/TextField';
import { badgeLabel } from '../../../lib/badge';
import { parseInviteToken } from '../../../lib/inviteLink';
import { useTheme } from '../../../theme/ThemeProvider';
import { useCurrentWorkspace, type MeWorkspace } from '../../../workspace/WorkspaceContext';

/**
 * The workspace switcher sheet (`?from=` the screen it opened over, so switching keeps the
 * section): my workspaces with their unread counts, joining by invite link, signing out.
 */
export default function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { me } = useAuth();
  const current = useCurrentWorkspace();
  const unread = useUnreadCounts();
  const logout = useLogout();
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const open = (workspace: MeWorkspace) => {
    if (workspace.id === current?.id) {
      router.back();
      return;
    }
    // Typed routes can't check a computed path; switchTarget only returns workspace sections.
    router.dismissTo(switchTarget(workspace.slug, from ?? '/my-tasks') as Href);
  };

  const join = () => {
    const token = parseInviteToken(link);
    if (!token) {
      setLinkError(t('workspace.joinLinkInvalid'));
      return;
    }
    router.dismissTo({ pathname: '/invite/[token]', params: { token } });
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.mobile.raised }}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: theme.sizes.gutter, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        accessibilityRole="header"
        style={[
          theme.type.sheetTitle,
          { color: theme.colors.text, fontFamily: theme.fontFor(600) },
        ]}
      >
        {t('workspace.switcherTitle')}
      </Text>
      <View>
        {me?.workspaces.map((workspace) => {
          const count = unread.data?.find((u) => u.workspaceId === workspace.id)?.unread ?? 0;
          const selected = workspace.id === current?.id;
          const role = t(`settings.roles.${workspace.role}`);
          return (
            <Pressable
              key={workspace.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={[
                workspace.name,
                role,
                count > 0 ? t('shell.unread', { count }) : null,
                selected ? t('workspace.current') : null,
              ]
                .filter(Boolean)
                .join(', ')}
              onPress={() => {
                open(workspace);
              }}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: theme.mobile.divider },
                pressed && { backgroundColor: theme.mobile.fill },
              ]}
            >
              <View style={[styles.tile, { backgroundColor: theme.colors.accent }]}>
                <Text style={[styles.tileText, { fontFamily: theme.fontFor(600) }]}>
                  {workspace.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.text}>
                <Text
                  numberOfLines={1}
                  style={[
                    theme.type.base,
                    { color: theme.colors.text, fontFamily: theme.fontFor(500) },
                  ]}
                >
                  {workspace.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    theme.type.meta,
                    { color: theme.colors.textMuted, fontFamily: theme.fontFor(400) },
                  ]}
                >
                  {workspace.title ? `${role} · ${workspace.title}` : role}
                </Text>
              </View>
              {count > 0 ? (
                <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
                  <Text style={[styles.badgeText, { fontFamily: theme.fontFor(600) }]}>
                    {badgeLabel(count)}
                  </Text>
                </View>
              ) : null}
              {selected ? <Check size={20} color={theme.colors.accentInk} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Text
        style={[theme.type.meta, { color: theme.colors.textMuted, fontFamily: theme.fontFor(400) }]}
      >
        {t('workspace.switcherLegend')}
      </Text>
      <View style={styles.join}>
        <TextField
          label={t('workspace.joinWithLink')}
          placeholder={t('workspace.joinLinkPlaceholder')}
          value={link}
          onChangeText={(text) => {
            setLink(text);
            setLinkError(null);
          }}
          error={linkError}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={join}
        />
        <Button
          variant="secondary"
          label={t('workspace.joinLinkOpen')}
          disabled={!link.trim()}
          onPress={join}
        />
      </View>
      <Button
        variant="plain"
        label={t('workspace.signOutOf', { email: me?.user.email ?? '' })}
        busy={logout.isPending}
        onPress={() => {
          logout.mutate();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 24 },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tile: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tileText: { color: '#FFFFFF', fontSize: 16, lineHeight: 20 },
  text: { flex: 1, gap: 2 },
  join: { gap: 12 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16 },
});
