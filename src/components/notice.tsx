import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { BilingualText } from '@/components/bilingual-text';
import { useAnnouncement } from '@/hooks/use-announcement';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Bilingual } from '@/i18n/strings';

/**
 * A tinted panel that states something about what is around it.
 *
 * Colour is never the only signal. Each tone carries three cues — a tint, a
 * marked badge, and words that say what is going on — so the meaning survives
 * colour blindness, a greyscale display, and a screen reader alike.
 *
 * The panel is a soft tint with a fine outline in its own colour. It once
 * carried a thick accent bar down its left edge as well, which made every
 * notice — including a routine "please compare with the bottle" — look like
 * an alert.
 *
 * Two tones only. `info` is for "please do this", `warn` for "this is not what
 * it looks like". There is deliberately no red: nothing this app shows is an
 * emergency, and a reader who is alarmed by a scan result may stop a medicine
 * they need rather than check it.
 */
export type NoticeTone = 'info' | 'warn';

export function Notice({
  tone,
  title,
  body,
  live = false,
  children,
}: {
  tone: NoticeTone;
  title: Bilingual;
  body?: Bilingual;
  /**
   * Speaks the notice when it appears: for one that reports what an action
   * just did (or failed to do), rather than one that is simply part of the
   * screen. See `useAnnouncement`.
   */
  live?: boolean;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  useAnnouncement(live ? [title.ko, body?.ko].filter(Boolean).join(' ') : null);
  const surface = tone === 'warn' ? theme.warnSurface : theme.infoSurface;
  const text = tone === 'warn' ? theme.warnText : theme.infoText;
  const edge = tone === 'warn' ? theme.warnEdge : theme.infoEdge;

  return (
    <View style={[styles.panel, { backgroundColor: surface, borderColor: edge }]}>
      <View style={styles.header}>
        <StatusBadge tone={tone} />
        <BilingualText text={title} variant="label" color={text} style={styles.title} />
      </View>
      {/*
        English on the title only. The title already says what is going on in
        both languages; repeating the explanation too doubled every warning, and
        a block that long reads as a lecture rather than a note.
      */}
      {body ? <BilingualText text={body} color={text} hideEnglish /> : null}
      {children}
    </View>
  );
}

/**
 * The marked circle. Decorative to assistive technology — the title beside it
 * says the same thing in words — so it is hidden rather than announced twice.
 */
export function StatusBadge({ tone }: { tone: NoticeTone }) {
  const theme = useTheme();
  const background = tone === 'warn' ? theme.warnAccent : theme.infoAccent;
  const glyph = tone === 'warn' ? theme.onWarnAccent : theme.onInfoAccent;

  return (
    <View
      style={[styles.badge, { backgroundColor: background }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      {/*
        Drawn rather than an emoji or icon font. Emoji warning signs render in
        the platform's own colours, which were not contrast-checked here, and
        vary across Android vendors.
      */}
      <Text
        style={[styles.glyph, { color: glyph }]}
        // A mark in a fixed circle, not text to read: scaled, it spilled out.
        maxFontSizeMultiplier={1}>
        {tone === 'warn' ? '!' : 'i'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: Radius.inner,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    // Beside the title's first line: centred, it floated halfway down a title
    // wrapped over several lines at large text sizes.
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
  },
});
