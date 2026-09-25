import { act } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { View } from 'react-native';

/**
 * The sweep's native camera view.
 *
 * On a device it reads a frame every few hundred milliseconds and sends only
 * the lines; here the test sends them, one frame at a time, as `frame` does.
 * It renders nothing and keeps its latest props, like the camera fake, so a
 * test can see whether it is reading (`active`) and whether it is mounted.
 */
type Line = { text: string; confidence: number | null };
type Props = {
  active: boolean;
  replay?: string;
  onLines: (event: {
    nativeEvent: { lines: readonly Line[]; width: number; height: number; source?: 'camera' | 'replay' };
  }) => void;
  onSweepError?: (event: { nativeEvent: { message: string } }) => void;
};

const state = {
  /** Android with the module compiled in; false is iOS, where the Swift is not linked. */
  available: true,
  props: null as Props | null,
  /** The development replays in the app's folder. */
  replays: [] as string[],
};

export function LabelSweepView(props: Props) {
  state.props = props;
  useEffect(
    () => () => {
      state.props = null;
    },
    []
  );
  return <View testID="label-sweep" />;
}

export const sweep = {
  get available() {
    return state.available;
  },
  set available(value: boolean) {
    state.available = value;
  },
  get mounted() {
    return state.props !== null;
  },
  get reading() {
    return state.props?.active ?? false;
  },
  /** The development replay the view was asked for, if any. */
  get replay() {
    return state.props?.replay;
  },
  get replays() {
    return state.replays;
  },
  set replays(names: string[]) {
    state.replays = names;
  },
  /**
   * One frame's lines, as the native view would send them, only while it is
   * reading: marked as a replay's when the view is replaying, as the native
   * code marks them, unless `source` says otherwise.
   */
  async frame(lines: readonly Line[], source?: 'camera' | 'replay'): Promise<void> {
    const props = state.props;
    if (!props?.active) return;
    const from = source ?? (props.replay ? 'replay' : 'camera');
    await act(async () => props.onLines({ nativeEvent: { lines, width: 1080, height: 1920, source: from } }));
  },
  async fail(): Promise<void> {
    const props = state.props;
    await act(async () => props?.onSweepError?.({ nativeEvent: { message: 'Camera failed (injected).' } }));
  },
  reset(): void {
    state.available = true;
    state.props = null;
    state.replays = [];
  },
};
