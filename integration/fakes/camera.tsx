import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

import { disk } from './file-system';

/**
 * expo-camera's `CameraView` and permission hook.
 *
 * The preview renders nothing, but keeps its latest props so a test can fire
 * `onBarcodeScanned` exactly as the preview would. The shutter writes a real
 * file into the fake cache — where expo-camera writes on a device — so tests
 * can prove the capture path deletes it.
 */
type Permission = { granted: boolean; canAskAgain: boolean; status: string };

const state = {
  permission: { granted: true, canAskAgain: true, status: 'granted' } as Permission | null,
  props: null as Record<string, unknown> | null,
  shots: 0,
  /** Replaces the shutter for one call, e.g. to return no picture. */
  nextShot: null as null | (() => Promise<unknown>),
  /** What the system dialog will answer when asked; null leaves the status as it is. */
  answer: null as Permission | null,
  /** How many times the system dialog was opened. */
  requests: 0,
};

export const CameraView = forwardRef<unknown, Record<string, unknown>>(function CameraView(props, ref) {
  state.props = props;
  useImperativeHandle(ref, () => ({
    async takePictureAsync() {
      if (state.nextShot) {
        const shot = state.nextShot;
        state.nextShot = null;
        return shot();
      }
      state.shots += 1;
      const uri = `file:///cache/Camera/shot-${state.shots}.jpg`;
      disk.write(uri, 'jpeg-bytes');
      return { uri, width: 3000, height: 4000, format: 'jpg' };
    },
  }));
  return <View testID="camera-preview" />;
});

export function useCameraPermissions(): [Permission | null, () => Promise<Permission | null>] {
  return [
    state.permission,
    async () => {
      state.requests += 1;
      if (state.answer) state.permission = state.answer;
      return state.permission;
    },
  ];
}

const GRANTED: Permission = { granted: true, canAskAgain: true, status: 'granted' };
const UNDECIDED: Permission = { granted: false, canAskAgain: true, status: 'undetermined' };
const REFUSED: Permission = { granted: false, canAskAgain: false, status: 'denied' };

export const camera = {
  state,
  /** Fires a barcode scan as the live preview would. */
  scan(result: { type: string; data: string }): Promise<void> | void {
    const handler = state.props?.onBarcodeScanned as ((scan: unknown) => Promise<void>) | undefined;
    if (!handler) throw new Error('The preview is not scanning.');
    return handler(result);
  },
  /** A fresh install: the camera has never been asked for, and will be allowed or refused. */
  notYetAsked(willAnswer: 'allow' | 'refuse'): void {
    state.permission = UNDECIDED;
    state.answer = willAnswer === 'allow' ? GRANTED : REFUSED;
  },
  /** The camera itself fails to start, as the preview reports it. */
  failToStart(): void {
    const handler = state.props?.onMountError as ((event: { message: string }) => void) | undefined;
    if (!handler) throw new Error('No preview is mounted.');
    handler({ message: 'Camera failed to start (injected).' });
  },
  /** Refused for good: the system will not ask again. */
  refused(): void {
    state.permission = REFUSED;
    state.answer = null;
  },
  reset(): void {
    state.permission = GRANTED;
    state.props = null;
    state.shots = 0;
    state.nextShot = null;
    state.answer = null;
    state.requests = 0;
  },
};
