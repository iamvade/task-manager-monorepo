import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

interface PlaceholderProps {
  title: string;
  subtitle?: string;
  /** Actions that work already (e.g. the workspace switcher). */
  children?: ReactNode;
}

/** Stand-in for a screen a later phase builds: its title and "being built". */
export function Placeholder({ title, subtitle, children }: PlaceholderProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.bg,
          paddingTop: insets.top + theme.sizes.gutter,
          paddingHorizontal: theme.sizes.gutter,
        },
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[
          theme.type.largeTitle,
          { color: theme.colors.text, fontFamily: theme.fontFor(600) },
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[theme.type.base, { color: theme.colors.text2, fontFamily: theme.fontFor(500) }]}
        >
          {subtitle}
        </Text>
      ) : null}
      <Text
        style={[theme.type.base, { color: theme.colors.textMuted, fontFamily: theme.fontFor(400) }]}
      >
        {t('common.comingSoon')}
      </Text>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  actions: { marginTop: 16, gap: 12 },
});
