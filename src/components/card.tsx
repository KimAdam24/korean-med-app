import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useLargeText } from '@/hooks/use-large-text';
import { useElevation, useTheme } from '@/hooks/use-theme';

/**
 * A surface that groups one thing — a medicine, a set of directions.
 *
 * Exists because the screens it replaces put every line at the same weight on
 * the same white, so nothing told the eye where one piece of information ended
 * and the next began. For a reader who scans rather than parses, the edge of a
 * card is the edge of a thought.
 *
 * That edge used to be a contrast-checked grey outline, on the reasoning that
 * these readers often cannot see a shadow. It made every screen read as a form.
 * A card is set apart now by three things at once — white on a warm page, a
 * soft shadow, and a faint hairline — none of them loud, so the text inside is
 * what the eye lands on. Controls keep their contrast-checked edges; a card is
 * not a control.
 *
 * `hero` is the tinted card for the one thing a screen is for — on home, taking
 * a photo. It has no shadow: the tint already sets it apart, and a lifted,
 * tinted card would compete with the button inside it.
 */
export function Card({
  children,
  flush = false,
  variant = 'plain',
  style,
}: {
  children: React.ReactNode;
  /**
   * No padding or gap, for a grouped list whose rows supply their own and
   * whose pressed highlight should run to the card's edge.
   */
  flush?: boolean;
  variant?: 'plain' | 'hero';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const elevation = useElevation();
  const hero = variant === 'hero';

  return (
    <View
      style={[
        styles.card,
        flush && styles.flush,
        hero
          ? { backgroundColor: theme.primaryWash, borderColor: theme.primaryWash }
          : [{ backgroundColor: theme.surface, borderColor: theme.hairline }, elevation.card],
        style,
      ]}>
      {/*
        A flush card clips its rows to its rounded corners. The clip is an inner
        view, because clipping the card itself would cut off its own shadow.
      */}
      {flush ? <View style={styles.clip}>{children}</View> : children}
    </View>
  );
}

/**
 * A rule between two parts of one card. `inset` indents it past a list row's
 * icon, the way grouped lists do, so the icons read as one column.
 */
export function CardDivider({ inset = false }: { inset?: boolean }) {
  const theme = useTheme();
  // Rows drop their icons at large text sizes, and the indent past them with it.
  const large = useLargeText();
  return (
    <View
      style={[styles.divider, inset && !large && styles.inset, { backgroundColor: theme.hairline }]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    borderCurve: 'continuous',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  flush: {
    padding: 0,
    gap: 0,
  },
  clip: {
    // Inside the 1pt border, so the curves stay concentric.
    borderRadius: Radius.card - 1,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  inset: {
    // Row padding, plus the icon well, plus the gap after it.
    marginLeft: Spacing.four - Spacing.one + 52 + Spacing.three,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // Hairline alone vanishes on some Android densities.
    minHeight: 1,
  },
});
