import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/app-text';
import { Radius, Spacing, TypeMaxScale } from '@/constants/theme';
import { setShowEnglish } from '@/features/preferences/preferences';
import { usePreferences } from '@/features/preferences/preferences-context';
import { useTheme } from '@/hooks/use-theme';
import { Strings } from '@/i18n/strings';

/**
 * The small button that shows the English under the Korean, for whoever the
 * phone is handed to: a pharmacist at the counter, a family member. The same
 * choice as the switch in Settings, and kept with it.
 *
 * It says "English", in English, for the person it is for: as a language
 * picker names each language in itself. A screen reader says the switch in
 * Korean (`settings.showEnglish`), with whether it is on. Filled when on,
 * outlined when off: told apart by more than colour.
 */
export const ENGLISH_BUTTON = 'English';

export function EnglishToggle() {
  const theme = useTheme();
  const { showEnglish } = usePreferences();

  return (
    <Pressable
      onPress={() => setShowEnglish(!showEnglish)}
      accessibilityRole="switch"
      accessibilityState={{ checked: showEnglish }}
      accessibilityLabel={Strings.settings.showEnglish.ko}
      accessibilityLanguage="ko-KR"
      style={({ pressed }) => [
        styles.pill,
        { borderColor: theme.outline, backgroundColor: showEnglish ? theme.primary : theme.surface },
        pressed && styles.pressed,
      ]}>
      <Text
        style={[styles.label, { color: showEnglish ? theme.onPrimary : theme.outline }]}
        maxFontSizeMultiplier={TypeMaxScale.button}>
        {ENGLISH_BUTTON}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    // Small to look at, but the 48dp Android asks of a target.
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: 2,
    borderRadius: Radius.pill,
    borderCurve: 'continuous',
  },
  label: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
