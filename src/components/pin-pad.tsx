import { Pressable, StyleSheet, View } from 'react-native';

import { BilingualText } from '@/components/bilingual-text';
import { Icon } from '@/components/icon';
import { IconSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Strings } from '@/i18n/strings';

/**
 * A numeric keypad, drawn rather than delegated to `TextInput`.
 *
 * The system keyboard is the obvious choice and a poor one here: its keys are
 * sized for a general audience, it covers the screen it is used on, and on
 * Android the number row and the numeric pad differ by device. A fixed 3×4 grid
 * of large targets is predictable and matches the phone dialer this user
 * already knows.
 *
 * Entered digits are shown as filled dots, never as numerals — the screen may
 * be visible to whoever is helping the user hold the phone.
 */

export type PinPadProps = {
  value: string;
  length: number;
  onChange: (next: string) => void;
  /** Blocks input while a lockout is running or verification is in flight. */
  disabled?: boolean;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({ value, length, onChange, disabled = false }: PinPadProps) {
  const theme = useTheme();

  const press = (digit: string) => {
    if (disabled || value.length >= length) return;
    onChange(value + digit);
  };

  const backspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  return (
    <View style={styles.root}>
      <View
        style={styles.dots}
        accessible
        accessibilityRole="text"
        // Announces progress without ever speaking the digits aloud.
        accessibilityLabel={`${value.length} / ${length}`}>
        {Array.from({ length }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              { borderColor: theme.textSecondary },
              // The icon tint, not the button fill: it clears 3:1 against the
              // page in dark mode too, which the fill does not.
              index < value.length && {
                backgroundColor: theme.primaryIcon,
                borderColor: theme.primaryIcon,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.grid}>
        {KEYS.map((digit) => (
          <Key key={digit} label={digit} onPress={() => press(digit)} disabled={disabled} />
        ))}
        {/* Empty cell keeps 0 centred under 8, as on a phone dialer. */}
        <View style={styles.key} />
        <Key label="0" onPress={() => press('0')} disabled={disabled} />
        <Key
          icon
          accessibilityLabel={Strings.pin.delete.ko}
          onPress={backspace}
          disabled={disabled || value.length === 0}
        />
      </View>
    </View>
  );
}

/**
 * One key. Digits are text; the delete key is the platform's own backspace
 * symbol rather than a `⌫` character, which some Android fonts draw as a box.
 */
function Key({
  label,
  icon = false,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  label?: string;
  icon?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.key,
        // A white key with a contrast-checked edge, like every other surface,
        // so the pad stays visible on the grey page.
        styles.keyFace,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
        disabled && styles.keyDisabled,
      ]}>
      {icon ? (
        <Icon name="backspace" color={theme.text} size={IconSize.button + 4} />
      ) : (
        <BilingualText text={{ ko: label ?? '', en: '' }} variant="heading" align="center" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.five,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.four,
    paddingVertical: Spacing.two,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.three,
    maxWidth: 340,
  },
  key: {
    width: 96,
    height: 84,
    borderRadius: Radius.button,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyFace: {
    borderWidth: 1,
  },
  keyDisabled: {
    opacity: 0.4,
  },
});
