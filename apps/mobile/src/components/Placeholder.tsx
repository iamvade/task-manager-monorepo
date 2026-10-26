import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

/** Stand-in for a screen a later phase builds: its title and "being built". */
export function Placeholder({ title }: { title: string }) {
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
      <Text
        style={[theme.type.base, { color: theme.colors.textMuted, fontFamily: theme.fontFor(400) }]}
      >
        {t('common.comingSoon')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
});
