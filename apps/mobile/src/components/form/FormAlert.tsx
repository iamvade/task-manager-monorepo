import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

/** A form-level error (wrong password, locked, offline), read out when it appears. */
export function FormAlert({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.root,
        {
          borderRadius: theme.radii.button,
          backgroundColor: theme.colors.formErrorBg,
          borderColor: theme.colors.formErrorBorder,
        },
      ]}
    >
      {title ? (
        <Text
          style={[theme.type.base, { color: theme.mobile.danger, fontFamily: theme.fontFor(600) }]}
        >
          {title}
        </Text>
      ) : null}
      <Text
        style={[theme.type.meta, { color: theme.colors.text2, fontFamily: theme.fontFor(400) }]}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, padding: 12, gap: 4 },
});
