import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { CameraChrome, Type, TypeMaxScale } from '@/constants/theme';
import { useAnnouncement } from '@/hooks/use-announcement';
import { useTheme } from '@/hooks/use-theme';
import type { Bilingual } from '@/i18n/strings';

/**
 * Korean primary, English secondary.
 *
 * Sizes start well above the scaffold's 16px body because the target user is
 * elderly (spec §2). Font scaling is left enabled, so nothing here may assume a
 * fixed text height — callers must let containers grow. Each size stops
 * growing where the system's own body text would; see `TypeMaxScale`.
 *
 * For screen readers the pair is announced as a single Korean string: a Korean
 * TTS voice reading the English line aloud is noise, not redundancy. It is
 * marked as Korean, so VoiceOver reads it in a Korean voice even on a phone
 * whose own language is English — the likely setup for an older user in the
 * US whose phone was set up by family.
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
  /**
   * The language the text is actually in, when it is not Korean — a drug name
   * printed in English, say. Placeholders awaiting translation are English
   * without being told.
   */
  language?: 'ko' | 'en';
  /**
   * Moves the screen reader here when this appears or its text changes. For
   * the heading of a step that replaced the one before it on the same screen:
   * otherwise focus stays on the button that was pressed — which is gone — and
   * lands wherever the platform decides.
   */
  autoFocus?: boolean;
  /**
   * Speaks the text when it appears or changes: for a message arriving after
   * an action, such as an error. See `useAnnouncement`.
   */
  live?: boolean;
  /** A tighter growth limit than the variant's, for text in a fixed space. */
  maxScale?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Long enough for the new content to be in the accessibility tree before focus
 * is sent to it; sent sooner, iOS drops it.
 */
const FOCUS_DELAY_MS = 300;

export function BilingualText({
  text,
  variant = 'body',
  onDark = false,
  color,
  secondaryColor: secondaryOverride,
  hideEnglish = false,
  align = 'left',
  language,
  autoFocus = false,
  live = false,
  maxScale,
  style,
}: BilingualTextProps) {
  const theme = useTheme();
  const primaryColor = color ?? (onDark ? CameraChrome.foreground : theme.text);
  const secondaryColor =
    secondaryOverride ?? color ?? (onDark ? 'rgba(255,255,255,0.72)' : theme.textSecondary);
  const textAlign = align;
  const english = language === 'en' || text.pendingKo;

  const ref = useRef<View>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => {
      if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoFocus, text.ko]);

  useAnnouncement(live ? text.ko : null);

  const primaryScale = Math.min(maxScale ?? Infinity, TypeMaxScale[variant]);
  const glossScale = Math.min(maxScale ?? Infinity, TypeMaxScale.gloss);

  return (
    <View
      ref={ref}
      style={[{ alignItems: align === 'center' ? 'center' : 'flex-start' }, style]}
      accessible
      accessibilityLabel={text.ko}
      accessibilityLanguage={english ? 'en-US' : 'ko-KR'}
      // Headings are announced as headings, so a screen-reader user can move
      // between sections of a result instead of listening to all of it.
      accessibilityRole={variant === 'heading' ? 'header' : undefined}>
      <Text
        style={[styles[variant], { color: primaryColor, textAlign }]}
        maxFontSizeMultiplier={primaryScale}>
        {text.ko}
      </Text>
      {hideEnglish || !text.en || text.pendingKo ? null : (
        <Text
          style={[styles.secondary, { color: secondaryColor, textAlign }]}
          maxFontSizeMultiplier={glossScale}
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
