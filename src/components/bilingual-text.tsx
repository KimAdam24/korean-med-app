import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { CameraChrome, Type } from '@/constants/theme';
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
  variant?: 'heading' | 'title' | 'body' | 'label' | 'button';
  /** Light-on-dark, for use over the camera preview. */
  onDark?: boolean;
  /**
   * Overrides for text sitting on a tinted surface — a warning or notice panel
   * — where the theme's default text colour was not the pair that was
   * contrast-checked against that tint.
   */
  color?: string;
  secondaryColor?: string;
  /**
   * Omit the English gloss. For explanatory text inside notices, where the
   * title already carries the gist in both languages and repeating a whole
   * sentence in English doubles the block for a reader who does not need it.
   */
  hideEnglish?: boolean;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
};

export function BilingualText({
  text,
  variant = 'body',
  onDark = false,
  color,
  secondaryColor: secondaryOverride,
  hideEnglish = false,
  align = 'left',
  style,
}: BilingualTextProps) {
  const theme = useTheme();
  const primaryColor = color ?? (onDark ? CameraChrome.foreground : theme.text);
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
      {hideEnglish || !text.en ? null : (
        <Text
          style={[styles.secondary, { color: secondaryColor, textAlign }]}
          // Already covered by the group's accessibilityLabel.
          accessibilityElementsHidden
          importantForAccessibility="no">
          {text.en}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: Type.heading,
  title: Type.title,
  body: Type.body,
  label: Type.label,
  button: Type.button,
  secondary: {
    /**
     * 14pt, the design skill's absolute minimum, and deliberately well below
     * the Korean it sits under. This was briefly 16 on the reasoning that it
     * was body text; seen rendered, English at nearly the Korean's size doubled
     * every block and competed with it. It is a gloss — for a caregiver, or for
     * matching a term against an English label — and should read as one.
     */
    ...Type.gloss,
    marginTop: 2,
  },
});
