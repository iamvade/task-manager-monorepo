import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { KiteMark } from './KiteMark';

interface AuthScreenProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** Signed-out screens (sign in, invite, no workspace): the Kite mark, title, then the form. */
export function AuthScreen({ title, subtitle, children }: AuthScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 48,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: theme.sizes.gutter,
          },
        ]}
      >
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <KiteMark size={40} />
        </View>
        <View style={styles.heading}>
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
              style={[
                theme.type.base,
                { color: theme.colors.textMuted, fontFamily: theme.fontFor(400) },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, gap: 24 },
  heading: { gap: 6 },
  body: { gap: 16 },
});
