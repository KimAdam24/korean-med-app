import { File } from 'expo-file-system';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useAppLock } from '@/features/security/app-lock-context';

import { pickImage } from '@/features/capture/pick-image';
import { addMedication } from '@/features/medications/medication-store';

import { LabelOcr } from '../../../modules/label-ocr';
import { DevLineList, logRecognizedLines } from './dev-line-list';
import { interpretLines } from './interpret-lines';
import { assessField, type FieldKind } from './field-integrity';
import { medicationFromReading } from './reading-to-record';
import {
  needsConfirmation,
  type ExtractedField,
  type MedicationLabelFields,
  type ReadQuality,
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
      quality?: ReadQuality;
    }
  | { kind: 'failed'; message: string }
  | { kind: 'saved'; name: string };

export function DevFileProbe() {
  const [state, setState] = useState<ProbeState>({ kind: 'idle' });
  const { runWithSystemUi } = useAppLock();

  const pickAndRead = useCallback(async () => {
    try {
      // Uses the same photo picker the real feature does, so this exercises
      // that path rather than a parallel one.
      const picked = await pickImage(runWithSystemUi);
      if (!picked) return;

      setState({ kind: 'reading' });

      // The picker's cache copy is kept while the probe shows its preview,
      // and removed by the launch sweep (`sweepPhotoCaches`). Development only.
      const file = new File(picked.uri);
      const lines = await LabelOcr.recognizeTextAsync(picked.uri);
      logRecognizedLines('file', lines);

      // The same interpretation the camera path runs, so what this shows is
      // what a real scan would show. Calling the parser separately here would
      // let the two drift apart silently.
      const result = interpretLines(lines);

      setState({
        kind: 'read',
        uri: picked.uri,
        byteLength: file.exists ? file.size : 0,
        lines,
        fields: result.status === 'recognized' ? result.fields : {},
        quality: result.status === 'recognized' ? result.quality : undefined,
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

  /**
   * Saves what the parser produced, through `addMedication` exactly as the
   * camera does. Marked for review like any label reading, because it is one.
   */
  const saveParsed = useCallback(async (fields: MedicationLabelFields) => {
    // The same mapping the camera uses, damaged fields dropped included, so
    // this exercises the real save rather than a looser parallel one.
    const toSave = medicationFromReading(fields);
    if (!toSave) return;

    await addMedication(toSave.record);
    setState({ kind: 'saved', name: toSave.record.name });
  }, []);

  const seedSample = useCallback(async () => {
    const record = await addMedication({
      name: 'SAMPLE-NOTAREALDRUG 100 MG',
      dosage: '100 MG',
      instructions: 'TAKE 1 TABLET BY MOUTH TWICE DAILY WITH FOOD',
      // 'manual' rather than 'label-scan': nothing read this off anything, and
      // the detail screen says where a record came from.
      source: 'manual',
      needsReview: true,
    });
    setState({ kind: 'saved', name: record.name });
  }, []);

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

      {state.kind === 'saved' && (
        <Text selectable style={styles.mono}>
          {`saved "${state.name}" — open My medicines to see it`}
        </Text>
      )}

      {/*
        Seeds a record with no image at all, so the list, detail, edit and
        delete screens can be exercised on a machine whose camera cannot
        produce one. Named obviously falsely for the same reason the test
        fixtures are: a sample that could be mistaken for a real medicine is a
        sample that will be.
      */}
      <BigButton
        label={{ ko: '가짜 약 하나 넣기 (개발용)', en: 'Seed a sample medicine (dev only)' }}
        tone="secondary"
        onPress={seedSample}
        disabled={state.kind === 'reading'}
      />

      {state.kind === 'read' && (
        <View style={styles.output}>
          {/* The picked file, shown so a wrong selection is obvious immediately. */}
          <Image
            source={{ uri: state.uri }}
            style={styles.preview}
            resizeMode="contain"
            // Decorative to a screen reader; the size and path beneath say what it is.
            accessible={false}
          />
          <Text selectable style={styles.mono}>
            {`${Math.round(state.byteLength / 1024)} KB  ${state.lines.length} line(s)\n${state.uri}`}
          </Text>

          {/*
            Parsed first, raw underneath. When a field is wrong the next
            question is always which line it came from, and having to scroll
            between the two to answer it is how a five-second check becomes a
            minute.
          */}
          <Text selectable style={styles.mono}>
            {state.quality
              ? `quality ${state.quality.level}${
                  state.quality.reasons.length > 0
                    ? ` (${state.quality.reasons.join(', ')})`
                    : ''
                }`
              : 'quality not assessed'}
          </Text>
          <ParsedFields fields={state.fields} />

          {/*
            The same save the camera performs, against the same store, so this
            exercises the real path rather than a parallel one. Only offered
            when a name was parsed, because `addMedication` needs one and a
            nameless record cannot be matched against a box.
          */}
          {state.fields.name ? (
            <BigButton
              label={{ ko: '이 약 등록하기 (개발용)', en: 'Add this to my medicines (dev only)' }}
              onPress={() => saveParsed(state.fields)}
            />
          ) : null}

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
  const rows: [string, FieldKind, ExtractedField | undefined][] = [
    ['name', 'name', fields.name],
    ['dosage', 'dosage', fields.dosage],
    ['sig', 'instructions', fields.instructions],
  ];

  return (
    <Text selectable style={styles.mono}>
      {rows
        .map(([label, kind, value]) => {
          // An absent field is the parser declining to guess, which is a
          // different outcome from a wrong one and should read differently.
          if (!value) return `${label.padEnd(7)} —  (absent, needs check)`;
          const flag = needsConfirmation(value) ? 'needs check' : 'ok';
          // The per-field verdict the result screen acts on, so a reviewer can
          // see why a field was withheld rather than guess.
          const integrity = assessField(kind, value.text);
          const verdict =
            integrity.level === 'damaged' ? ` DAMAGED(${integrity.reasons.join(',')})` : '';
          return `${label.padEnd(7)} [${value.confidence.toFixed(2)} ${flag}${verdict}] ${value.text}`;
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
