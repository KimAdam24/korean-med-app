import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { CameraChrome, Radius, Spacing } from '@/constants/theme';
import { Strings, fillTemplate } from '@/i18n/strings';

import { LabelSweepView, type SweepLinesEvent } from '../../../../modules/label-sweep';
import { logRecognizedLines } from '../dev-line-list';
import { EMPTY_SWEEP, addFrame, mergeSweep, type MergedReading, type SweepState } from './merge';
import { logReplayFrames } from './replay-log';
import type { RecognizedTextLine } from '../types';

/**
 * No line newly completed for this long, and the sweep ends with what it has:
 * the camera is not left reading a label that has stopped giving anything.
 */
const STALL_MS = 20_000;

/** How a sweep ended, for the result to say: by itself, by the user, or stalled. */
export type SweepEnding = 'complete' | 'stopped' | 'stalled';

/** How far text over the live viewfinder may grow; see camera.tsx's OVERLAY_MAX_SCALE. */
const OVERLAY_MAX_SCALE = 1.4;

/**
 * The sweep: the label read continuously while the user turns the bottle,
 * until every line reads complete (docs/sweep-privacy.md for what it keeps).
 *
 * What is held here is lines of text and their geometry — the merge's state —
 * and nothing else; the native view never sends a frame. It is dropped when
 * the sweep finishes, when the app goes to the background, and when this
 * screen goes away. The final reading is logged once, redacted, in
 * development builds; no frame is ever logged.
 *
 * `onDone` receives the merged reading, or `null` when nothing usable was
 * read; the capture screen shows it exactly as it shows a photograph's.
 */
export function SweepReader({
  onDone,
  onCancel,
  replay,
}: {
  onDone: (merged: MergedReading | null, ending: SweepEnding) => void;
  onCancel: () => void;
  /** DEVELOPMENT ONLY: frames from this replay instead of the camera. */
  replay?: string;
}) {
  const [active, setActive] = useState(true);
  const [merged, setMerged] = useState<MergedReading | null>(null);
  const [failed, setFailed] = useState(false);

  const sweep = useRef<SweepState>(EMPTY_SWEEP);
  /** The latest merged reading, for the stall timer, which outlives renders. */
  const latest = useRef<MergedReading | null>(null);
  /** DEVELOPMENT REPLAY ONLY: every frame read, logged once at the end. See `replay-log`. */
  const replayFrames = useRef<(readonly RecognizedTextLine[])[]>([]);
  const finished = useRef(false);
  /** When the reading last got further; set when the sweep starts. */
  const progressAt = useRef(0);
  const progress = useRef('');

  const drop = () => {
    sweep.current = EMPTY_SWEEP;
    latest.current = null;
    replayFrames.current = [];
    setMerged(null);
  };

  const finish = useCallback(
    (result: MergedReading | null, ending: SweepEnding) => {
      if (finished.current) return;
      finished.current = true;
      setActive(false);
      if (result) logRecognizedLines('sweep', result.result.lines ?? []);
      if (__DEV__ && replay) logReplayFrames(replay, replayFrames.current);
      // The per-frame history goes; only the merged reading moves on.
      sweep.current = EMPTY_SWEEP;
      latest.current = null;
      replayFrames.current = [];
      onDone(result, ending);
    },
    [onDone, replay]
  );

  // Backgrounding drops everything read, rather than trusting the lock to.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        drop();
        setActive(false);
      } else if (next === 'active' && !finished.current) {
        setActive(true);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    progressAt.current = Date.now();
    const timer = setInterval(() => {
      if (latest.current && Date.now() - progressAt.current > STALL_MS) finish(latest.current, 'stalled');
    }, 1000);
    return () => {
      clearInterval(timer);
      sweep.current = EMPTY_SWEEP;
      latest.current = null;
    };
  }, [finish]);

  const onLines = useCallback(
    ({ nativeEvent }: { nativeEvent: SweepLinesEvent }) => {
      if (finished.current) return;
      // Kept only in a replay, and only a frame the native view read from a
      // replay's file: nothing sets this for a camera's frame.
      if (__DEV__ && replay && nativeEvent.source === 'replay') replayFrames.current.push(nativeEvent.lines);
      sweep.current = addFrame(sweep.current, nativeEvent.lines);
      const next = mergeSweep(sweep.current);
      latest.current = next;
      setMerged(next);

      const signature = next ? `${next.stillCut.length}|${next.replaced.join(',')}` : '';
      if (signature !== progress.current) {
        progress.current = signature;
        progressAt.current = Date.now();
      }
      if (next?.complete) finish(next, 'complete');
    },
    [finish, replay]
  );

  if (!LabelSweepView) return null;

  const status = failed
    ? Strings.sweep.failed
    : !merged
      ? Strings.sweep.waiting
      : merged.complete
        ? Strings.sweep.allRead
        : merged.stillCut.length > 0
          ? fillTemplate(Strings.sweep.progress, { n: merged.stillCut.length })
          : // Nothing is cut, but a field still does not read whole.
            Strings.sweep.unclear;

  return (
    <View style={styles.root}>
      <LabelSweepView
        style={StyleSheet.absoluteFill}
        active={active}
        replay={__DEV__ ? replay : undefined}
        onLines={onLines}
        onSweepError={() => setFailed(true)}
      />
      <SafeAreaView style={styles.overlay}>
        <View style={styles.banner}>
          <BilingualText text={Strings.sweep.privacy} variant="label" align="center" onDark maxScale={OVERLAY_MAX_SCALE} />
        </View>

        <View style={styles.bottom}>
          <BilingualText text={Strings.sweep.instructions} align="center" onDark maxScale={OVERLAY_MAX_SCALE} />
          <View style={styles.status}>
            <BilingualText text={status} variant="label" align="center" onDark live maxScale={OVERLAY_MAX_SCALE} />
          </View>
          {merged ? <BigButton label={Strings.sweep.stop} onPress={() => finish(merged, 'stopped')} /> : null}
          <BigButton
            label={Strings.medications.cancel}
            tone="secondary"
            onPress={() => {
              finished.current = true;
              setActive(false);
              drop();
              onCancel();
            }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CameraChrome.background,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  banner: {
    backgroundColor: CameraChrome.scrim,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    margin: Spacing.three,
    borderRadius: Radius.card,
    borderCurve: 'continuous',
  },
  bottom: {
    gap: Spacing.three,
    padding: Spacing.four,
    backgroundColor: CameraChrome.scrim,
  },
  status: {
    minHeight: 48,
    justifyContent: 'center',
  },
});
