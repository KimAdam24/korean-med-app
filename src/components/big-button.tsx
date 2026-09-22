import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { BilingualText } from '@/components/bilingual-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Bilingual } from '@/i18n/strings';

/**
 * Primary action target, sized for unsteady hands and poor close vision:
 * comfortably past the 44pt minimum, with generous padding rather than a fixed
 * height so it still contains its label at large system font sizes.
 */
export type BigButtonProps = {
  label: Bilingual;
  onPress: () => void;
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function BigButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  style,
}: BigButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label.ko}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        tone === 'primary'
          ? styles.primary
          : // From the theme rather than fixed: the brand blue that works as an
            // outline on white falls to about 3:1 on the dark page.
            [styles.secondary, { borderColor: theme.outline }],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <BilingualText
        text={label}
        variant="button"
        align="center"
        onDark={tone === 'primary'}
        // The Pressable already announces the label.
        style={styles.labelBlock}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 72,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.four,
  },
  primary: {
    backgroundColor: '#1B5FB0',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  labelBlock: {
    alignSelf: 'stretch',
  },
});
