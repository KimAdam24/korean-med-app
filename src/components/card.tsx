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
 * Every card is white, edged by a fine line, on the paper-toned page: flat,
 * like a printed leaflet (design pass of 2026-10-06). None is tinted, not even
 * the one a screen is for: a warning or an info note is then the only coloured
 * box on a screen, and nothing competes with it. Controls keep their
 * contrast-checked edges; a card is not a control.
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
        { backgroundColor: theme.surface, borderColor: theme.hairline },
        style,
      ]}>
      {/* A flush card clips its rows to its rounded corners. */}
      {flush ? <View style={styles.clip}>{children}</View> : children}
    </View>
  );
}

/** A rule between two parts of one card, edge to edge. */
export function CardDivider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.hairline }]} />;
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
  divider: {
    height: StyleSheet.hairlineWidth,
    // Hairline alone vanishes on some Android densities.
    minHeight: 1,
  },
});
