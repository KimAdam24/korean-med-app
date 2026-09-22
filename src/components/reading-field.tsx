import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BilingualText } from '@/components/bilingual-text';
import { Notice } from '@/components/notice';
import { Radius, Spacing } from '@/constants/theme';
import { assessField, type FieldKind } from '@/features/ocr/field-integrity';
import { useTheme } from '@/hooks/use-theme';
import { Strings, type Bilingual } from '@/i18n/strings';

/**
 * One field of a medicine: its label, and either its value or the plain
 * statement that the value could not be read.
 *
 * ## The rule this component enforces
 *
 * Text judged damaged is **never rendered where the value goes**. A reader
 * looking at "how to take it" reads whatever sits under it as their
 * instructions, and damaged text there is dangerous rather than untidy — the
 * first real label tested lost the `UP` of `UP TO 3 TIMES DAILY`, turning a
 * ceiling into a schedule.
 *
 * So a damaged field shows a message in the value's place, and the raw reading
 * only behind a deliberate tap, in a recessed box captioned as inaccurate, with
 * the worst words marked. That keeps it available to a caregiver or pharmacist
 * comparing against the bottle, without ever presenting it as the answer.
 *
 * Nothing is repaired. A wrongly "corrected" drug name or dose looks exactly
 * like a right one; visibly broken text at least announces itself.
 */
export function ReadingField({
  label,
  kind,
  text,
  assess,
  prominent = false,
}: {
  label: Bilingual;
  kind: FieldKind;
  text?: string;
  /**
   * Whether to judge the text for OCR damage. True for anything a machine read;
   * false for text the user typed or confirmed, which is theirs — flagging a
   * typo in the user's own words as a misread would be both wrong and insulting.
   */
  assess: boolean;
  /** The medicine name: larger, because it is what gets matched against the box. */
  prominent?: boolean;
}) {
  const theme = useTheme();
  const [showRaw, setShowRaw] = useState(false);

  const integrity = useMemo(
    () => (text && assess ? assessField(kind, text) : null),
    [assess, kind, text]
  );

  return (
    <View style={styles.field}>
      <BilingualText text={label} variant="label" />

      {!text ? (
        <Text style={[styles.missing, { color: theme.textSecondary }]}>
          {Strings.result.missing.ko}
        </Text>
      ) : integrity?.level === 'damaged' ? (
        <Notice
          tone="warn"
          title={Strings.result.damaged[kind].title}
          body={Strings.result.damaged[kind].body}>
          <Pressable
            onPress={() => setShowRaw((shown) => !shown)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showRaw }}
            accessibilityLabel={(showRaw ? Strings.result.hideRaw : Strings.result.showRaw).ko}
            hitSlop={Spacing.two}
            style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
            <BilingualText
              text={showRaw ? Strings.result.hideRaw : Strings.result.showRaw}
              variant="label"
              color={theme.warnText}
            />
          </Pressable>

          {showRaw ? (
            <View
              style={[styles.raw, { backgroundColor: theme.recessed }]}
              accessible
              // The caption is read first, so a screen reader never voices the
              // damaged letters without first saying they are not accurate.
              accessibilityLabel={`${Strings.result.rawCaption.ko} ${text}`}>
              <Text style={[styles.rawText, { color: theme.recessedText }]}>
                {integrity.spans.map((span, index) =>
                  span.damaged ? (
                    <Text
                      key={index}
                      // Underline as well as a tint: marking by colour alone
                      // is lost to colour blindness and greyscale.
                      style={[
                        styles.damagedWord,
                        { backgroundColor: theme.damagedMark, color: theme.damagedMarkText },
                      ]}>
                      {span.text}
                    </Text>
                  ) : (
                    span.text
                  )
                )}
              </Text>
              <Text style={[styles.caption, { color: theme.recessedText }]}>
                {Strings.result.rawCaption.ko}
              </Text>
            </View>
          ) : null}
        </Notice>
      ) : (
        <Text
          style={[prominent ? styles.valueProminent : styles.value, { color: theme.text }]}
          // Drug names are English and are read aloud as written.
          accessibilityLabel={text}>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  value: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '500',
  },
  valueProminent: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
  },
  missing: {
    fontSize: 20,
    lineHeight: 28,
    fontStyle: 'italic',
  },
  toggle: {
    // 48 is Android's minimum target; this sits inside a panel an unsteady
    // finger has to hit.
    minHeight: 48,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  raw: {
    borderRadius: Radius.inner,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  rawText: {
    fontSize: 18,
    lineHeight: 28,
  },
  damagedWord: {
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  caption: {
    fontSize: 16,
    lineHeight: 22,
  },
});
