import { StyleSheet, Text } from 'react-native';

import { Fonts } from '@/constants/theme';

import type { RecognizedTextLine } from './types';

/**
 * Development-only rendering of engine output.
 *
 * Shared by the camera result screen and the file probe so that both produce
 * the *same* text. They exist to capture data for the sig parser, and two
 * formats would mean the parser gets written against one of them and quietly
 * mismatches the other.
 *
 * `selectable` so lines can be copied off the device without a cable.
 */
export function DevLineList({ lines }: { lines: readonly RecognizedTextLine[] }) {
  if (!__DEV__) return null;

  return (
    <Text selectable style={styles.text}>
      {lines.map(formatLine).join('\n')}
    </Text>
  );
}

function formatLine(line: RecognizedTextLine, index: number): string {
  // An em dash rather than a number when the engine reports no confidence,
  // which on Android is every line.
  const score = line.confidence === null ? '—' : line.confidence.toFixed(2);
  return `${String(index).padStart(2, '0')} [${score}] ${line.text}`;
}

/**
 * Prints engine output to the console for capture via Metro or `adb logcat`.
 *
 * **Gated on `__DEV__` and it must stay that way.** These lines are the text
 * printed on someone's medication — the drug, the dose, often the prescriber.
 * Spec §4 keeps that to the user, and a release build writing it to the device
 * log would hand it to anything able to read logs. Metro evaluates `__DEV__` to
 * `false` in production and drops the branch, so the call disappears from a
 * release bundle — but only because the check is here rather than at each call
 * site, where one of them would eventually be written without it.
 *
 * JSON rather than the rendered text: line boundaries and per-line confidence
 * are exactly what a human-readable dump loses, and exactly what the parser has
 * to be built against.
 */
export function logRecognizedLines(source: string, lines: readonly RecognizedTextLine[]): void {
  if (!__DEV__) return;
  // Delimited so it survives being pulled out of a noisy log with grep.
  console.log(
    `[label-ocr] BEGIN ${source} ${lines.length} line(s)\n` +
      JSON.stringify(lines, null, 2) +
      `\n[label-ocr] END ${source}`
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.mono,
    color: '#60646C',
  },
});
