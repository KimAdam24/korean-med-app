import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The frame every stacked screen sits in: the page colour, a readable maximum
 * width, and one edge padding and rhythm for the whole app.
 *
 * Replaces a `Sheet` that four screens each defined for themselves, all with
 * the same flaw: a safe-area inset on every edge, under a navigation header
 * that already accounts for the top one. Each screen opened with a status
 * bar's height of empty space below its title. The top edge is now left to
 * the header unless a screen has none — the lock screen, which replaces the
 * navigator entirely.
 */
export function Screen({
  children,
  scroll = false,
  centered = false,
  edges = HEADER_EDGES,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  /** Centre the content vertically: short screens with one job. */
  centered?: boolean;
  edges?: readonly Edge[];
}) {
  const theme = useTheme();
  const content = <View style={[styles.content, centered && styles.centered]}>{children}</View>;

  return (
    <View style={[styles.root, { backgroundColor: theme.page }]}>
      <SafeAreaView style={styles.safeArea} edges={edges}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            // A tap on a button must not first be spent dismissing a keyboard.
            keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </SafeAreaView>
    </View>
  );
}

/** Under a navigation header, which owns the top inset. */
const HEADER_EDGES: readonly Edge[] = ['left', 'right', 'bottom'];

/** For a screen with no header at all. */
export const ALL_EDGES: readonly Edge[] = ['top', 'left', 'right', 'bottom'];

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    // A little more air than the 16 between a card's own lines, so sections
    // read as separate without a heading to say so.
    gap: Spacing.three + Spacing.one,
    padding: Spacing.four,
  },
  centered: {
    justifyContent: 'center',
    gap: Spacing.four,
  },
});
