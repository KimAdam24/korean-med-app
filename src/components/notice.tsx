import { StyleSheet, Text, View } from 'react-native';

import { BilingualText } from '@/components/bilingual-text';
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
  children,
}: {
  tone: NoticeTone;
  title: Bilingual;
  body?: Bilingual;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const surface = tone === 'warn' ? theme.warnSurface : theme.infoSurface;
  const text = tone === 'warn' ? theme.warnText : theme.infoText;
  const accent = tone === 'warn' ? theme.warnAccent : theme.infoAccent;

  return (
    <View style={[styles.panel, { backgroundColor: surface, borderLeftColor: accent }]}>
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
      <Text style={[styles.glyph, { color: glyph }]}>{tone === 'warn' ? '!' : 'i'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderLeftWidth: 6,
    borderRadius: Radius.inner,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
