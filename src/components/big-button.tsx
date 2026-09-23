import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BilingualText } from '@/components/bilingual-text';
import { Icon, type IconName } from '@/components/icon';
import { IconSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Bilingual } from '@/i18n/strings';

/**
 * Primary action target, sized for unsteady hands and poor close vision:
 * comfortably past the 44pt minimum, with generous padding rather than a fixed
 * height so it still contains its label at large system font sizes.
 *
 * Three tones. `primary` is the one thing to do next on a screen. `secondary`
 * is everything else. `caution` is for the actions that cannot be undone —
 * removing a medicine, erasing everything — and is marked by colour and by the
 * words on it, never colour alone.
 */
export type BigButtonProps = {
  label: Bilingual;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'caution';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function BigButton({
  label,
  onPress,
  tone = 'primary',
  icon,
  disabled = false,
  style,
}: BigButtonProps) {
  const theme = useTheme();
  const primary = tone === 'primary';
  // Outline colours come from the theme rather than being fixed: the brand
  // blue that works as an outline on white falls to about 3:1 on the dark page.
  const accent = primary ? theme.onPrimary : tone === 'caution' ? theme.warnAccent : theme.outline;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label.ko}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        primary
          ? { backgroundColor: pressed ? theme.primaryPressed : theme.primary }
          : [
              styles.outlined,
              {
                borderColor: accent,
                backgroundColor: pressed ? theme.backgroundSelected : theme.surface,
              },
            ],
        disabled && styles.disabled,
        style,
      ]}>
      <View style={styles.content}>
        {icon ? <Icon name={icon} color={accent} size={IconSize.button} /> : null}
        <BilingualText
          text={label}
          variant="button"
          align="center"
          onDark={primary}
          color={tone === 'caution' ? theme.warnAccent : undefined}
          secondaryColor={tone === 'caution' ? theme.warnAccent : undefined}
          // The Pressable already announces the label.
          style={styles.label}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 72,
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.button,
    borderCurve: 'continuous',
  },
  outlined: {
    borderWidth: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two + Spacing.one,
  },
  label: {
    // Shrinks rather than pushing the icon off the button when the system
    // font size is large and the label wraps.
    flexShrink: 1,
  },
  disabled: {
    opacity: 0.4,
  },
});
