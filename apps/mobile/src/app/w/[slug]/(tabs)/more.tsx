import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Placeholder } from '../../../../components/Placeholder';
import { buildInfo } from '../../../../lib/buildInfo';
import { useTheme } from '../../../../theme/ThemeProvider';

export default function MoreTab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const info = buildInfo();
  const update = [info.channel, info.updateId ?? t('more.updateBuiltIn')]
    .filter(Boolean)
    .join(' · ');
  const rows = [
    { label: t('more.version'), value: info.version, mono: true },
    { label: t('more.server'), value: info.server, mono: false },
    { label: t('more.update'), value: update, mono: true },
  ];
  const label = [theme.type.base, { color: theme.colors.text, fontFamily: theme.fontFor(400) }];
  return (
    <Placeholder title={t('tabs.more')}>
      <Text
        accessibilityRole="header"
        style={[theme.type.base, { color: theme.colors.textMuted, fontFamily: theme.fontFor(500) }]}
      >
        {t('more.about')}
      </Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={label}>{row.label}</Text>
          <Text
            selectable
            style={[
              theme.type.base,
              styles.value,
              { color: theme.colors.text2, fontFamily: theme.fontFor(400, row.mono) },
            ]}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </Placeholder>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  value: { flexShrink: 1, textAlign: 'right' },
});
