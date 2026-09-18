import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { Bilingual } from '@/i18n/strings';

/**
 * Korean primary, English secondary.
 *
 * Sizes start well above the scaffold's 16px body because the target user is
 * elderly (spec §2). Font scaling is left enabled, so nothing here may assume a
 * fixed text height — callers must let containers grow.
 *
 * For screen readers the pair is announced as a single Korean string: a Korean
 * TTS voice reading the English line aloud is noise, not redundancy.
 */
export type BilingualTextProps = {
  text: Bilingual;
  variant?: 'heading' | 'body' | 'label' | 'button';
  /** Light-on-dark, for use over the camera preview. */
  onDark?: boolean;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
};

export function BilingualText({
  text,
  variant = 'body',
  onDark = false,
  align = 'left',
  style,
}: BilingualTextProps) {
  const theme = useTheme();
  const primaryColor = onDark ? '#ffffff' : theme.text;
  const secondaryColor = onDark ? 'rgba(255,255,255,0.72)' : theme.textSecondary;
  const textAlign = align;

  return (
    <View
      style={[{ alignItems: align === 'center' ? 'center' : 'flex-start' }, style]}
      accessible
      accessibilityLabel={text.ko}>
      <Text style={[styles[variant], { color: primaryColor, textAlign }]}>{text.ko}</Text>
      <Text
        style={[styles.secondary, { color: secondaryColor, textAlign }]}
        // Already covered by the group's accessibilityLabel.
        accessibilityElementsHidden
        importantForAccessibility="no">
        {text.en}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '700',
  },
  body: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '500',
  },
  label: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
  },
  button: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
  },
  secondary: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    marginTop: 2,
  },
});
