import { File } from 'expo-file-system';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useAppLock } from '@/features/security/app-lock-context';

import { LabelOcr } from '../../../modules/label-ocr';
import { DevLineList, logRecognizedLines } from './dev-line-list';
import { interpretLines } from './device-recognizer';
import {
  needsConfirmation,
  type ExtractedField,
  type MedicationLabelFields,
  type RecognizedTextLine,
} from './types';

/**
 * Runs the OCR engine against a file chosen from the device, bypassing the
 * camera entirely.
 *
 * Exists because the camera is not always a usable source of test data. An
 * Android emulator returns a synthetic frame in `Emulated` mode and, on many
 * Windows hosts, a black one in `Webcam0` mode too — so a developer can be
 * unable to feed the engine a real label at all, through no fault of the app.
 * Being able to point it at a photograph that already exists removes the
 * emulator from the loop.
 *
 * ## Why this does not go through `withTransientCapture`
 *
 * That function's contract is delete-or-throw: it owns the photograph it took
 * and guarantees the file does not outlive the read. Applying it here would
 * delete a file the *user* owns and chose — their own photo, in their own
 * storage — which is not ours to destroy. The transient-capture guarantee is
 * about photographs this app creates, and a picked file is not one.
 *
 * So this calls the engine directly. Nothing is copied, nothing is written, and
 * nothing is deleted.
 *
 * It does run the same interpretation the camera path runs, via
 * `interpretLines`, and shows the parsed fields above the raw output. Showing
 * only raw lines was right while the parser did not exist; once it did, a probe
 * that could not exercise it left the parser testable solely through a camera
 * that, on this setup, does not work.
 *
 * ## Development only
 *
 * Renders nothing outside `__DEV__`. A shipped medical app should not carry a
 * "read text out of an arbitrary image" affordance: it is scaffolding, and it
 * is not translated for the real audience.
 */
type ProbeState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | {
      kind: 'read';
      uri: string;
      byteLength: number;
      lines: readonly RecognizedTextLine[];
      fields: MedicationLabelFields;
    }
  | { kind: 'failed'; message: string };

export function DevFileProbe() {
  const [state, setState] = useState<ProbeState>({ kind: 'idle' });
  const { runWithSystemUi } = useAppLock();

  const pickAndRead = useCallback(async () => {
    try {
      // The picker is a separate activity, so opening it backgrounds this one.
      // Without this the app would re-lock, unmount this component, and drop
      // the picked file on the floor while the user typed their PIN.
      const picked = await runWithSystemUi(() => File.pickFileAsync({ mimeTypes: 'image/*' }));
      if (picked.canceled) return;

      setState({ kind: 'reading' });

      const file = picked.result;
      const lines = await LabelOcr.recognizeTextAsync(file.uri);
      logRecognizedLines('file', lines);

      // The same interpretation the camera path runs, so what this shows is
      // what a real scan would show. Calling the parser separately here would
      // let the two drift apart silently.
      const result = interpretLines(lines);

      setState({
        kind: 'read',
        uri: file.uri,
        byteLength: file.size,
        lines,
        fields: result.status === 'recognized' ? result.fields : {},
      });
    } catch (error) {
      // Surfaced rather than swallowed: when the point of a tool is diagnosis,
      // a silent failure is the one outcome that helps nobody.
      setState({
        kind: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [runWithSystemUi]);

  if (!__DEV__) return null;

  return (
    <View style={styles.root}>
      <BilingualText
        text={{ ko: '파일에서 글씨 읽기 (개발용)', en: 'Read a label from a file (dev only)' }}
        variant="label"
      />

      <BigButton
        label={{ ko: '사진 고르기', en: 'Choose an image' }}
        tone="secondary"
        onPress={pickAndRead}
        disabled={state.kind === 'reading'}
      />

      {state.kind === 'reading' && <ActivityIndicator size="large" />}

      {state.kind === 'failed' && (
        <Text selectable style={styles.mono}>
          {state.message}
        </Text>
      )}

      {state.kind === 'read' && (
        <View style={styles.output}>
          {/* The picked file, shown so a wrong selection is obvious immediately. */}
          <Image source={{ uri: state.uri }} style={styles.preview} resizeMode="contain" />
          <Text selectable style={styles.mono}>
            {`${Math.round(state.byteLength / 1024)} KB  ${state.lines.length} line(s)\n${state.uri}`}
          </Text>

          {/*
            Parsed first, raw underneath. When a field is wrong the next
            question is always which line it came from, and having to scroll
            between the two to answer it is how a five-second check becomes a
            minute.
          */}
          <ParsedFields fields={state.fields} />
          <DevLineList lines={state.lines} />
        </View>
      )}
    </View>
  );
}

/**
 * The parser's output, with each field's confidence and whether the UI would
 * demand confirmation for it.
 *
 * `needsConfirmation` is shown rather than inferred by eye because it is the
 * decision that actually matters: a field can look right and still be flagged,
 * and a reviewer comparing this against a label needs to see which.
 */
function ParsedFields({ fields }: { fields: MedicationLabelFields }) {
  const rows: [string, ExtractedField | undefined][] = [
    ['name', fields.name],
    ['dosage', fields.dosage],
    ['sig', fields.instructions],
  ];

  return (
    <Text selectable style={styles.mono}>
      {rows
        .map(([label, value]) => {
          // An absent field is the parser declining to guess, which is a
          // different outcome from a wrong one and should read differently.
          if (!value) return `${label.padEnd(7)} —  (absent, needs check)`;
          const flag = needsConfirmation(value) ? 'needs check' : 'ok';
          return `${label.padEnd(7)} [${value.confidence.toFixed(2)} ${flag}] ${value.text}`;
        })
        .join('\n')}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  output: {
    gap: Spacing.two,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#00000010',
  },
  mono: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.mono,
    color: '#60646C',
  },
});
