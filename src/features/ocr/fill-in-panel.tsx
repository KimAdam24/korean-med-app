import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card } from '@/components/card';
import { Notice } from '@/components/notice';
import { Radius, Spacing, Type, TypeMaxScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate } from '@/i18n/strings';

import { assessField, type FieldKind } from './field-integrity';
import { applyFillIns, expectsNumber, findGaps, gapKey, type Gap } from './fill-in';
import { interpretLines } from './interpret-lines';
import { isCutAtEdge } from './truncation';
import type { LabelRecognitionResult, MedicationLabelFields, RecognizedTextLine } from './types';

type Recognised = Extract<LabelRecognitionResult, { status: 'recognized' }>;

const FIELD_LABEL = {
  name: Strings.result.name,
  dosage: Strings.result.dosage,
  instructions: Strings.result.instructions,
} as const;

/**
 * Filling in, by hand, what the camera could not read — only that, in place,
 * with the rest of the line around it. See `fill-in` for what a gap is.
 *
 * The answer is not taken on trust: the lines with the user's words in them
 * go through the whole pipeline again, and are accepted only if every field
 * being filled then reads whole. Then the result is shown back — "is this what
 * the bottle says?" — before it replaces the reading. Nothing is saved from
 * here; that is still the result screen's save, with its own notices.
 */
export function FillInPanel({
  lines,
  fields,
  kinds,
  onConfirm,
  onCancel,
}: {
  lines: readonly RecognizedTextLine[];
  fields: MedicationLabelFields;
  /** The withheld fields to fill in. */
  kinds: readonly FieldKind[];
  onConfirm: (reading: Recognised) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const gaps = useMemo(() => {
    const all = kinds.flatMap((kind) => findGaps(lines, fields, kind));
    return all.filter((gap, index) => all.findIndex((other) => gapKey(other) === gapKey(gap)) === index);
  }, [fields, kinds, lines]);
  const [typed, setTyped] = useState<Map<string, string>>(
    () => new Map(gaps.flatMap((gap) => (gap.kind === 'word' ? [[gapKey(gap), gap.read] as const] : [])))
  );
  const [confirming, setConfirming] = useState<Recognised | null>(null);
  const [incomplete, setIncomplete] = useState(false);

  const check = () => {
    const result = interpretLines(applyFillIns(lines, gaps, typed));
    if (result.status !== 'recognized') return setIncomplete(true);
    const whole = kinds.every((kind) => {
      const text = result.fields[kind]?.text;
      return Boolean(text) && !isCutAtEdge(result.truncation, kind) && assessField(kind, text!).level === 'readable';
    });
    if (!whole) return setIncomplete(true);
    setIncomplete(false);
    setConfirming(result);
  };

  if (confirming) {
    return (
      <Card>
        <BilingualText text={Strings.fillIn.confirmTitle} variant="title" autoFocus />
        {kinds.map((kind) => (
          <View key={kind} style={styles.confirmed}>
            <BilingualText text={FIELD_LABEL[kind]} variant="label" />
            <Text
              style={[styles.value, { color: theme.text }]}
              maxFontSizeMultiplier={TypeMaxScale.body}
              accessibilityLanguage="en-US">
              {confirming.fields[kind]?.text}
            </Text>
          </View>
        ))}
        <BigButton label={Strings.fillIn.confirmYes} onPress={() => onConfirm(confirming)} />
        <BigButton label={Strings.fillIn.confirmNo} tone="secondary" onPress={() => setConfirming(null)} />
      </Card>
    );
  }

  const byLine = [...new Set(gaps.map((gap) => gap.line))];

  return (
    <Card>
      <BilingualText text={Strings.fillIn.title} variant="title" autoFocus />
      <BilingualText text={Strings.fillIn.body} variant="label" hideEnglish />
      {byLine.map((lineIndex) => (
        <LineWithGaps
          key={lineIndex}
          number={lineIndex + 1}
          text={lines[lineIndex].text}
          gaps={gaps.filter((gap) => gap.line === lineIndex)}
          typed={typed}
          onType={(gap, value) => setTyped((current) => new Map(current).set(gapKey(gap), value))}
        />
      ))}
      {incomplete ? <Notice tone="warn" title={Strings.fillIn.stillIncomplete} live /> : null}
      <BigButton label={Strings.fillIn.check} onPress={check} />
      <BigButton label={Strings.medications.cancel} tone="secondary" onPress={onCancel} />
    </Card>
  );
}

/** One printed line: its words as read, with a box at each gap. */
function LineWithGaps({
  number,
  text,
  gaps,
  typed,
  onType,
}: {
  number: number;
  text: string;
  gaps: readonly Gap[];
  typed: ReadonlyMap<string, string>;
  onType: (gap: Gap, value: string) => void;
}) {
  const theme = useTheme();
  const tokens = text.split(/\s+/).filter(Boolean);

  const box = (gap: Gap) => (
    <TextInput
      key={gapKey(gap)}
      value={typed.get(gapKey(gap)) ?? ''}
      onChangeText={(value) => onType(gap, value)}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={expectsNumber(gap) ? Platform.select({ ios: 'numbers-and-punctuation', default: 'phone-pad' }) : 'default'}
      accessibilityLabel={
        gap.kind === 'word'
          ? fillTemplate(Strings.fillIn.wordLabel, { line: number, read: gap.read }).ko
          : fillTemplate(Strings.fillIn.insertLabel, { line: number }).ko
      }
      maxFontSizeMultiplier={TypeMaxScale.body}
      style={[
        styles.box,
        { color: theme.text, borderColor: theme.warnAccent, backgroundColor: theme.warnSurface },
      ]}
    />
  );

  return (
    <View style={styles.line}>
      {tokens.flatMap((token, position) => {
        const word = gaps.find((gap) => gap.kind === 'word' && gap.token === position);
        const insert = gaps.find((gap) => gap.kind === 'insert' && gap.after === position);
        const parts = [
          word ? (
            box(word)
          ) : (
            <Text
              key={`t${position}`}
              style={[styles.word, { color: theme.text }]}
              maxFontSizeMultiplier={TypeMaxScale.body}
              accessibilityLanguage="en-US">
              {token}
            </Text>
          ),
        ];
        if (insert) parts.push(box(insert));
        return parts;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  word: {
    ...Type.body,
  },
  box: {
    ...Type.body,
    minWidth: 96,
    minHeight: 56,
    paddingHorizontal: Spacing.two,
    borderWidth: 2,
    borderRadius: Radius.inner,
    borderCurve: 'continuous',
  },
  confirmed: {
    gap: Spacing.one,
  },
  value: {
    ...Type.body,
  },
});
