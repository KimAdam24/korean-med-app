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
};

export type LabelSweepViewProps = ViewProps & {
  /** Reading only while true; the camera is released when false. */
  active: boolean;
  torch?: boolean;
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
