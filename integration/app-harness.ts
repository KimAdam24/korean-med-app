import { AppState } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { disk } from './fakes/file-system';

/**
 * Drives the real app — `src/app`, its layout, the lock in front of it — the
 * way a person would: by what is on screen and what they press.
 *
 * React Native's Jest mock of `AppState` has `currentState` as a mock
 * function rather than a string and never announces changes, so the harness
 * owns both: the app launches in the foreground, and `sendAppTo` delivers a
 * transition to every listener the app registered.
 */

type AppStateMock = {
  currentState: unknown;
  addEventListener: jest.Mock;
};

const appState = AppState as unknown as AppStateMock;

export function launchApp(initialUrl = '/') {
  appState.currentState = 'active';
  return renderRouter('src/app', { initialUrl });
}

export async function sendAppTo(state: 'active' | 'background' | 'inactive'): Promise<void> {
  appState.currentState = state;
  const listeners = appState.addEventListener.mock.calls
    .filter(([type]) => type === 'change')
    .map(([, listener]) => listener as (next: string) => void);
  await act(async () => {
    for (const listener of listeners) listener(state);
  });
}

/** Presses keypad keys, one digit at a time, as a thumb would. */
export function pressDigits(digits: string): void {
  for (const digit of digits) {
    fireEvent.press(screen.getByRole('button', { name: digit }));
  }
}

export function press(label: string): void {
  fireEvent.press(screen.getByRole('button', { name: label }));
}

/**
 * Marks the phone as past its first launch. The app writes this marker on
 * first launch, before any PIN exists; without it, a PIN already in the
 * keychain looks like one left behind by a deleted installation, and is
 * cleared — see `install-marker`.
 */
export function alreadySetUp(): void {
  disk.write('file:///document/installed.v1', '');
}

/** Clears the listeners recorded by the previous test's app. */
export function forgetAppStateListeners(): void {
  appState.addEventListener.mockClear();
}

/** Every piece of text on screen, in order — for diagnosing a failing test. */
export function visibleText(): string[] {
  const texts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') texts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(screen.toJSON());
  return texts;
}
