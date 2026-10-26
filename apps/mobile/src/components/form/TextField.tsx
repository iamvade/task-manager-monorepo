import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  /** Shown under the field (and announced) when set. */
  error?: string | null;
  hint?: string;
  /** A password: hidden, with an eye toggle. */
  password?: boolean;
}

/** Labeled 48px input with 16px text (no iOS zoom). The designed kit replaces it in B4. */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, error, hint, password = false, editable = true, ...input },
  ref,
) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);
  const note = error ?? hint;
  return (
    <View style={styles.root}>
      <Text
        style={[theme.type.meta, { color: theme.colors.text2, fontFamily: theme.fontFor(500) }]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            height: theme.sizes.field,
            borderRadius: theme.radii.button,
            borderColor: error ? theme.mobile.danger : theme.colors.borderControl,
            backgroundColor: editable ? theme.colors.control : theme.mobile.fill,
          },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={note ?? undefined}
          editable={editable}
          secureTextEntry={password && !revealed}
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            theme.type.input,
            {
              color: editable ? theme.colors.text : theme.colors.textMuted,
              fontFamily: theme.fontFor(400),
            },
          ]}
          {...input}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            hitSlop={8}
            onPress={() => {
              setRevealed((r) => !r);
            }}
            style={styles.eye}
          >
            {revealed ? (
              <EyeOff size={20} color={theme.colors.iconMuted} />
            ) : (
              <Eye size={20} color={theme.colors.iconMuted} />
            )}
          </Pressable>
        ) : null}
      </View>
      {note ? (
        <Text
          accessibilityLiveRegion={error ? 'polite' : 'none'}
          style={[
            theme.type.meta,
            {
              color: error ? theme.mobile.danger : theme.colors.textMuted,
              fontFamily: theme.fontFor(400),
            },
          ]}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: 6 },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 14 },
  input: { flex: 1, paddingVertical: 0 },
  eye: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
});
