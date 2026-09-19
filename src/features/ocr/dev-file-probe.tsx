import { File } from 'expo-file-system';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Fonts, Spacing } from '@/constants/theme';

import { LabelOcr } from '../../../modules/label-ocr';
import { DevLineList, logRecognizedLines } from './dev-line-list';
import type { RecognizedTextLine } from './types';

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
 * ## Development only
 *
 * Renders nothing outside `__DEV__`. A shipped medical app should not carry a
 * "read text out of an arbitrary image" affordance: it is scaffolding, it is
 * not translated for the real audience, and its output is deliberately raw.
 */
type ProbeState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'read'; uri: string; byteLength: number; lines: readonly RecognizedTextLine[] }
  | { kind: 'failed'; message: string };

export function DevFileProbe() {
  const [state, setState] = useState<ProbeState>({ kind: 'idle' });

  const pickAndRead = useCallback(async () => {
    try {
      const picked = await File.pickFileAsync({ mimeTypes: 'image/*' });
      if (picked.canceled) return;

      setState({ kind: 'reading' });

      const file = picked.result;
      const lines = await LabelOcr.recognizeTextAsync(file.uri);
      logRecognizedLines('file', lines);

      setState({ kind: 'read', uri: file.uri, byteLength: file.size, lines });
    } catch (error) {
      // Surfaced rather than swallowed: when the point of a tool is diagnosis,
      // a silent failure is the one outcome that helps nobody.
      setState({
        kind: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
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

      {state.kind === 'read' && (
        <View style={styles.output}>
          {/* The picked file, shown so a wrong selection is obvious immediately. */}
          <Image source={{ uri: state.uri }} style={styles.preview} resizeMode="contain" />
          <Text selectable style={styles.mono}>
            {`${Math.round(state.byteLength / 1024)} KB  ${state.lines.length} line(s)\n${state.uri}`}
          </Text>
          <DevLineList lines={state.lines} />
        </View>
      )}
    </View>
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
