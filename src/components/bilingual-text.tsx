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
  /**
   * Overrides for text sitting on a tinted surface — a warning or notice panel
   * — where the theme's default text colour was not the pair that was
   * contrast-checked against that tint.
   */
  color?: string;
  secondaryColor?: string;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
};

export function BilingualText({
  text,
  variant = 'body',
  onDark = false,
  color,
  secondaryColor: secondaryOverride,
  align = 'left',
  style,
}: BilingualTextProps) {
  const theme = useTheme();
  const primaryColor = color ?? (onDark ? '#ffffff' : theme.text);
  const secondaryColor =
    secondaryOverride ?? color ?? (onDark ? 'rgba(255,255,255,0.72)' : theme.textSecondary);
  const textAlign = align;

  return (
    <View
      style={[{ alignItems: align === 'center' ? 'center' : 'flex-start' }, style]}
      accessible
      accessibilityLabel={text.ko}
      // Headings are announced as headings, so a screen-reader user can move
      // between sections of a result instead of listening to all of it.
      accessibilityRole={variant === 'heading' ? 'header' : undefined}>
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
    // 16 rather than 15: the English line is secondary, not small print, and
    // 16 is the floor for body text this app's readers should ever meet.
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    marginTop: 2,
  },
});
