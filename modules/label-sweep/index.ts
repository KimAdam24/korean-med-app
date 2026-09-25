import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

import type { RecognizedLine } from '../label-ocr/src/LabelOcr.types';

/**
 * The sweep's camera view (see README.md). Frames stay in native code; this
 * receives only what was read from each: its lines, in the same shape the
 * single capture returns, and the frame's upright size.
 */
export type SweepLinesEvent = {
  readonly lines: readonly RecognizedLine[];
  readonly width: number;
  readonly height: number;
  /**
   * Where the frame came from, as the native code that read it says: the
   * camera, or a development replay's file. Only a replay's frames may be
   * kept for debugging (`replay-log.ts`).
   */
  readonly source?: 'camera' | 'replay';
};

export type LabelSweepViewProps = ViewProps & {
  /** Reading only while true; the camera is released when false. */
  active: boolean;
  torch?: boolean;
  /**
   * DEVELOPMENT ONLY: read frames from this replay, in the app's
   * `sweep-replay` folder, instead of the camera (see `SweepReplay.kt`).
   * Ignored by a release build.
   */
  replay?: string;
  onLines: (event: { nativeEvent: SweepLinesEvent }) => void;
  onSweepError?: (event: { nativeEvent: { message: string } }) => void;
};

/**
 * Whether this build can sweep: Android, with the native module compiled in.
 * iOS is false until its Swift has been compiled and linked (see README.md);
 * an Android build made before the module existed is false too, and the app
 * offers the single capture instead of a view that cannot render.
 */
export const sweepAvailable =
  Platform.OS === 'android' && requireOptionalNativeModule('LabelSweep') !== null;

export const LabelSweepView: ComponentType<LabelSweepViewProps> | null = sweepAvailable
  ? requireNativeView<LabelSweepViewProps>('LabelSweep')
  : null;

const native = sweepAvailable ? requireOptionalNativeModule<{ replays(): string[] }>('LabelSweep') : null;

/**
 * DEVELOPMENT ONLY: the names of the replays on this phone, from the app's
 * `sweep-replay` folder. Always empty in a release build, on both sides.
 */
export function listReplays(): string[] {
  if (!__DEV__ || !native) return [];
  try {
    return native.replays();
  } catch {
    // A build from before the list existed.
    return [];
  }
}
