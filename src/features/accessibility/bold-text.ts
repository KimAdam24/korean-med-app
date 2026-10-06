import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';

import { IOS_BOLD_TEXT_STEP } from '@/constants/typeface';

import { TextWeight } from '../../../modules/text-weight';

/**
 * How much the phone's Bold text setting adds to every font weight: 300 when
 * it is on, 0 when off. See `typeface`, which applies it.
 *
 * On Android, read from the setting itself (`modules/text-weight`), at once,
 * and again whenever the app comes back to the front, since the setting is
 * changed in the phone's settings, outside the app. On iOS, from
 * `AccessibilityInfo`, which answers a moment later and says when it changes.
 *
 * Watched only while something on screen draws text, which in the app is
 * always, from launch: the root layout's header uses it.
 *
 * Never throws: a phone that cannot say is a phone without Bold text, and the
 * text is drawn at its own weights, as before.
 */
let adjustment = readAndroid();
const listeners = new Set<() => void>();
let unwatch: (() => void) | null = null;

function readAndroid(): number {
  if (Platform.OS !== 'android') return 0;
  try {
    const value = TextWeight?.fontWeightAdjustment();
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function set(next: number): void {
  if (next === adjustment) return;
  adjustment = next;
  for (const listener of listeners) listener();
}

const fromIos = (on: boolean) => set(on ? IOS_BOLD_TEXT_STEP : 0);

function refresh(): void {
  if (Platform.OS === 'android') set(readAndroid());
  else if (Platform.OS === 'ios') AccessibilityInfo.isBoldTextEnabled().then(fromIos, () => undefined);
}

function watch(): () => void {
  refresh();
  const returned = AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });
  const changed = Platform.OS === 'ios' ? AccessibilityInfo.addEventListener('boldTextChanged', fromIos) : null;
  return () => {
    returned.remove();
    changed?.remove();
  };
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) unwatch = watch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unwatch?.();
      unwatch = null;
    }
  };
}

const snapshot = () => adjustment;

export function useBoldTextAdjustment(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** For tests: the setting read again, as a launch would read it. */
export function rereadBoldText(): void {
  adjustment = readAndroid();
}
