import { Strings } from '../../src/i18n/strings.ts';

/**
 * Text that appears only once the app's JavaScript has run and drawn its
 * first screen — whichever of them a device starts on.
 *
 * A live process is not evidence the app started: a development build whose
 * dev server cannot be reached sits on a blank screen indefinitely, alive and
 * crash-free. The smoke check once reported exactly that as a pass. These are
 * taken from the app's own strings, so they cannot drift from what it shows.
 */
export const FIRST_SCREEN_TEXTS: readonly string[] = [
  Strings.onboarding.welcomeTitle.ko, // a fresh install: the introduction
  Strings.lock.title.ko, // the lock, on a phone with its own lock
  Strings.lock.prompt.ko, // the system fingerprint prompt the lock opens
  Strings.pin.createTitle.ko, // first launch on a phone with no lock
  Strings.pin.enterTitle.ko, // the PIN, on a phone with no lock
  Strings.home.capture.ko, // home, if already unlocked
];

/**
 * The first-screen text in a `uiautomator dump`, or null if there is none.
 * Reads `text` and `content-desc` from every node, whichever window it is in:
 * the fingerprint prompt belongs to the system, but its message is the app's.
 */
export function firstScreenIn(dump: string): string | null {
  const shown = new Set<string>();
  for (const match of dump.matchAll(/\b(?:text|content-desc)="([^"]*)"/g)) {
    shown.add(unescapeXml(match[1]));
  }
  return FIRST_SCREEN_TEXTS.find((text) => shown.has(text)) ?? null;
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}
