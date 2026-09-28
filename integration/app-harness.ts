import { AppState } from 'react-native';
import { act, fireEvent, getMockContext, renderRouter, screen } from 'expo-router/testing-library';

import { disk } from './fakes/file-system';

import { Scope } from '@/features/scope';

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

/**
 * Loads every screen of the app, and everything they import, before any test
 * runs: `beforeAll(loadApp, APP_LOAD_BUDGET_MS)`.
 *
 * The router requires its screens while it renders, so otherwise the first
 * test in each suite also pays to compile and load the whole app — about a
 * second warm, four and a half from a cold cache, against Jest's five-second
 * limit for a test. On a machine short of memory that went over, and the
 * first test of each app-level suite failed, the one time unexplained. Loaded
 * here, under its own budget, each test's limit measures only the test.
 */
export function loadApp(): void {
  // Under fake timers, as `renderRouter` loads them.
  jest.useFakeTimers();
  const screens = getMockContext('src/app');
  for (const file of screens.keys()) screens(file);
}

/** Loading has nothing to check; this budget only has to catch a hang. */
export const APP_LOAD_BUDGET_MS = 60_000;

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

/**
 * A phone on which the app has never been opened: without the introduction
 * marker every other suite starts with. See `reset.ts`.
 */
export function firstEverLaunch(): void {
  disk.files.delete('file:///document/onboarded.v1');
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

/**
 * Turns every hidden feature back on for the tests that follow (`Scope`), and
 * off again after each: `describe(..., () => { withFullScope(); ... })`.
 *
 * So the hidden features keep their tests, and restoring one is a flag, not a
 * rewrite. The app reads `Scope` as it renders, so this takes effect on the
 * next screen drawn.
 */
export function withFullScope(): void {
  const flags = Scope as { -readonly [K in keyof typeof Scope]: boolean };
  let saved: typeof Scope;
  beforeEach(() => {
    saved = { ...Scope };
    for (const key of Object.keys(flags) as (keyof typeof Scope)[]) flags[key] = true;
  });
  afterEach(() => {
    Object.assign(flags, saved);
  });
}
