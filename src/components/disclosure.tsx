import { Pressable, StyleSheet } from 'react-native';

import { BilingualText } from '@/components/bilingual-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Bilingual } from '@/i18n/strings';

/**
 * A text button that shows or hides something beside it: its words say which
 * it will do, and a screen reader hears whether it is open.
 *
 * Set as a link, not a full-width button: it opens more of what is already on
 * the card rather than doing something.
 */
export function Disclosure({
  open,
  show,
  hide,
  onToggle,
}: {
  open: boolean;
  show: Bilingual;
  hide: Bilingual;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const label = open ? hide : show;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={label.ko}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.target, pressed && styles.pressed]}>
      <BilingualText text={label} variant="label" color={theme.outline} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    // 48 is Android's minimum target.
    minHeight: 48,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
