import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'plain';
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}

/** 48px button (primary: accent fill). The designed kit replaces it in B4. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || busy;
  // White on the accent in both themes, as on the web's primary button.
  const fg = primary ? '#FFFFFF' : theme.colors.accentInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        {
          height: variant === 'plain' ? theme.sizes.touch : theme.sizes.button,
          borderRadius: theme.radii.button,
          backgroundColor: primary
            ? theme.colors.accent
            : variant === 'secondary'
              ? theme.mobile.fill
              : 'transparent',
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : null}
      <Text style={[theme.type.base, { color: fg, fontFamily: theme.fontFor(600) }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
