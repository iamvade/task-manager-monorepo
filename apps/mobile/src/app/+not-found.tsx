import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';

export default function NotFound() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <Text
        accessibilityRole="header"
        style={[
          theme.type.sheetTitle,
          { color: theme.colors.text, fontFamily: theme.fontFor(600) },
        ]}
      >
        {t('common.notFoundTitle')}
      </Text>
      <Text
        style={[theme.type.base, { color: theme.colors.textMuted, fontFamily: theme.fontFor(400) }]}
      >
        {t('common.notFoundBody')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
});
