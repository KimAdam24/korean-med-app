import { useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card } from '@/components/card';
import { Notice } from '@/components/notice';
import { Radius, Spacing, Type, TypeMaxScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate, type Bilingual } from '@/i18n/strings';

import { assessField, type FieldKind } from './field-integrity';
import {
  answerProblems,
  applyFillIns,
  assemble,
  expectsNumber,
  fieldLines,
  findGaps,
  gapKey,
  repetition,
  type Gap,
} from './fill-in';
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
 * with the rest of the field around it. See `fill-in` for what a gap is.
 *
 * ## Which words are already there
 *
 * The field is shown as one passage, every line of it, the way it reads on
 * the bottle, not line by line as the camera saw it; and each box is kept on
 * the same row as the word after it. Shown line by line, the box for the
 * vial's "(50,000" ended one row and "units)" began the next, so someone
 * reading "(50,000 units)" off the bottle typed it whole, and "days", on a
 * line with no box, was not shown at all. Under the boxes, "It will read"
 * shows the field as it stands, as they type, their words marked, so a word
 * typed twice is there to see; and on Check, an answer that repeats the words
 * beside its box is refused, naming them.
 *
 * ## Not taken on trust
 *
 * Then the lines with the user's words in them go through the whole pipeline
 * again, and are accepted only if every field being filled reads whole. Then
 * the result is shown back — "is this what the bottle says?" — before it
 * replaces the reading. Nothing is saved from here; that is still the result
 * screen's save, with its own notices.
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
  /** With the fields that were filled in: the others are as they were, withheld or not. */
  onConfirm: (reading: Recognised, filled: readonly FieldKind[]) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const gaps = useMemo(() => {
    const all = kinds.flatMap((kind) => findGaps(lines, fields, kind));
    return all.filter((gap, index) => all.findIndex((other) => gapKey(other) === gapKey(gap)) === index);
  }, [fields, kinds, lines]);
  /** The fields with something to fill in, each with every line it is made of. */
  const passages = useMemo(
    () =>
      kinds
        .map((kind) => ({ kind, lineIndexes: fieldLines(lines, fields, kind) }))
        .filter(({ lineIndexes }) => gaps.some((gap) => lineIndexes.includes(gap.line))),
    [fields, gaps, kinds, lines]
  );
  const [typed, setTyped] = useState<Map<string, string>>(
    () => new Map(gaps.flatMap((gap) => (gap.kind === 'word' ? [[gapKey(gap), gap.read] as const] : [])))
  );
  const [confirming, setConfirming] = useState<Recognised | null>(null);
  const [problem, setProblem] = useState<Bilingual | null>(null);

  const check = () => {
    // First: nothing the camera saw of a cut word may be typed away.
    const [dropped] = answerProblems(gaps, typed);
    if (dropped) {
      return setProblem(
        fillTemplate(dropped.keep === 'prefix' ? Strings.fillIn.keepStart : Strings.fillIn.keepEnd, {
          read: dropped.gap.read,
        })
      );
    }
    // Then: no word of the label's typed again beside its box.
    for (const { lineIndexes } of passages) {
      const repeated = repetition(assemble(lines, gaps, typed, lineIndexes));
      if (repeated) {
        return setProblem(
          fillTemplate(repeated.where === 'after' ? Strings.fillIn.repeatedAfter : Strings.fillIn.repeatedBefore, {
            words: repeated.words.join(' '),
          })
        );
      }
    }

    const result = interpretLines(applyFillIns(lines, gaps, typed));
    const whole =
      result.status === 'recognized' &&
      kinds.every((kind) => {
        const text = result.fields[kind]?.text;
        return Boolean(text) && !isCutAtEdge(result.truncation, kind) && assessField(kind, text!).level === 'readable';
      });
    if (result.status !== 'recognized' || !whole) return setProblem(Strings.fillIn.stillIncomplete);
    setProblem(null);
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
        <BigButton label={Strings.fillIn.confirmYes} onPress={() => onConfirm(confirming, kinds)} />
        <BigButton label={Strings.fillIn.confirmNo} tone="secondary" onPress={() => setConfirming(null)} />
      </Card>
    );
  }

  const onType = (gap: Gap, value: string) => {
    setTyped((current) => new Map(current).set(gapKey(gap), value));
  };

  return (
    <Card>
      <BilingualText text={Strings.fillIn.title} variant="title" autoFocus />
      <BilingualText text={Strings.fillIn.body} variant="label" hideEnglish />
      {passages.map(({ kind, lineIndexes }) => (
        <View key={kind} style={styles.field}>
          <BilingualText text={FIELD_LABEL[kind]} variant="label" />
          <Passage lines={lines} lineIndexes={lineIndexes} gaps={gaps} typed={typed} onType={onType} />
          <Preview pieces={assemble(lines, gaps, typed, lineIndexes)} />
        </View>
      ))}
      {problem ? <Notice tone="warn" title={problem} live /> : null}
      <BigButton label={Strings.fillIn.check} onPress={check} />
      <BigButton label={Strings.medications.cancel} tone="secondary" onPress={onCancel} />
    </Card>
  );
}

type Item = { key: string; box?: Gap; word?: string; line: number };

/**
 * The field's words in one flowing passage, a box at each gap. Each box
 * shares a row with the word after it (or, at the very end, the word before
 * it), so the label's own words beside a box can never look like the start
 * of something new.
 */
function Passage({
  lines,
  lineIndexes,
  gaps,
  typed,
  onType,
}: {
  lines: readonly RecognizedTextLine[];
  lineIndexes: readonly number[];
  gaps: readonly Gap[];
  typed: ReadonlyMap<string, string>;
  onType: (gap: Gap, value: string) => void;
}) {
  const theme = useTheme();

  const items: Item[] = [];
  for (const index of lineIndexes) {
    lines[index].text
      .split(/\s+/)
      .filter(Boolean)
      .forEach((token, position) => {
        const word = gaps.find((gap) => gap.line === index && gap.kind === 'word' && gap.token === position);
        items.push(word ? { key: gapKey(word), box: word, line: index } : { key: `t${index}:${position}`, word: token, line: index });
        const insert = gaps.find((gap) => gap.line === index && gap.kind === 'insert' && gap.after === position);
        if (insert) items.push({ key: gapKey(insert), box: insert, line: index });
      });
  }

  // Boxes, with the word that follows them, as one unbreakable group.
  const groups: Item[][] = [];
  let open: Item[] | null = null;
  for (const item of items) {
    if (item.box) {
      open = open ?? [];
      open.push(item);
    } else if (open) {
      open.push(item);
      groups.push(open);
      open = null;
    } else {
      groups.push([item]);
    }
  }
  if (open) {
    // A box at the very end: it keeps the word before it instead.
    const previous = groups.length > 0 && groups[groups.length - 1].length === 1 && !groups[groups.length - 1][0].box;
    groups.push(previous ? [...groups.pop()!, ...open] : open);
  }

  const render = (item: Item): ReactNode =>
    item.box ? (
      <TextInput
        key={item.key}
        value={typed.get(gapKey(item.box)) ?? ''}
        onChangeText={(value) => onType(item.box!, value)}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={
          expectsNumber(item.box) ? Platform.select({ ios: 'numbers-and-punctuation', default: 'phone-pad' }) : 'default'
        }
        accessibilityLabel={
          item.box.kind === 'word'
            ? fillTemplate(Strings.fillIn.wordLabel, { line: item.line + 1, read: item.box.read }).ko
            : fillTemplate(Strings.fillIn.insertLabel, { line: item.line + 1 }).ko
        }
        maxFontSizeMultiplier={TypeMaxScale.body}
        style={[styles.box, { color: theme.text, borderColor: theme.warnAccent, backgroundColor: theme.warnSurface }]}
      />
    ) : (
      <Text
        key={item.key}
        style={[styles.word, { color: theme.text }]}
        maxFontSizeMultiplier={TypeMaxScale.body}
        accessibilityLanguage="en-US">
        {item.word}
      </Text>
    );

  return (
    <View style={styles.passage}>
      {groups.map((group) =>
        group.length === 1 ? (
          render(group[0])
        ) : (
          <View key={group.map((item) => item.key).join('+')} style={styles.together}>
            {group.map(render)}
          </View>
        )
      )}
    </View>
  );
}

/** "It will read": the field as it stands, the words the user typed marked. */
function Preview({ pieces }: { pieces: ReturnType<typeof assemble> }) {
  const theme = useTheme();
  return (
    <View style={[styles.preview, { backgroundColor: theme.recessed }]}>
      <BilingualText text={Strings.fillIn.preview} variant="label" color={theme.recessedText} />
      <Text
        style={[styles.value, { color: theme.recessedText }]}
        maxFontSizeMultiplier={TypeMaxScale.body}
        accessibilityLanguage="en-US">
        {pieces.map((piece, index) => (
          <Text key={index} style={piece.changed ? styles.typed : undefined}>
            {index > 0 ? ' ' : ''}
            {piece.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  passage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  together: {
    flexDirection: 'row',
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
  preview: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.inner,
  },
  typed: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  confirmed: {
    gap: Spacing.one,
  },
  value: {
    ...Type.body,
  },
});
