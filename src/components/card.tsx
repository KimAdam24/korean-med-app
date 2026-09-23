import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A surface that groups one thing — a medicine, a set of directions.
 *
 * Exists because the screens it replaces put every line at the same weight on
 * the same white, so nothing told the eye where one piece of information ended
 * and the next began. For a reader who scans rather than parses, the edge of a
 * card is the edge of a thought.
 *
 * The border is contrast-checked (3.3:1 light, 3.4:1 dark) rather than a pale
 * decorative line, because the readers this app is for often cannot see a
 * shadow at all.
 */
export function Card({
  children,
  flush = false,
  style,
}: {
  children: React.ReactNode;
  /**
   * No padding or gap, for a grouped list whose rows supply their own and
   * whose pressed highlight should run to the card's edge.
   */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        flush && styles.flush,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}>
      {children}
    </View>
  );
}

/**
 * A rule between two parts of one card. `inset` indents it past a list row's
 * icon, the way grouped lists do, so the icons read as one column.
 */
export function CardDivider({ inset = false }: { inset?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.divider, inset && styles.inset, { backgroundColor: theme.border }]} />
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
    opacity: 0.5,
  },
});
