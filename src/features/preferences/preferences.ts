import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Two choices about what the screens show, kept as marker files beside the
 * onboarding marker: a file present means "yes".
 *
 * Outside the encrypted vault, on purpose. Neither says anything about a
 * medicine, and whether English is shown has to be known before the vault is
 * open: the lock screen is bilingual too. Read synchronously, as the onboarding
 * marker is, so the first screen is drawn as chosen rather than redrawn a
 * moment later.
 *
 * Never blocks the app: a marker that cannot be read counts as "no", which is
 * each choice's default.
 */
export type Preferences = {
  /** The English line under each Korean one. Off by default: Korean only. */
  readonly showEnglish: boolean;
  /**
   * The user has seen, and dismissed, the warning that Do Not Disturb could
   * silence reminders. Phone-wide, as Do Not Disturb is. Cleared once the
   * reminders are seen to pass it, so that if they stop passing, the warning
   * is new again. See `ReminderStatus`.
   */
  readonly dndWarningSeen: boolean;
};

const SHOW_ENGLISH = 'show-english.v1';
const DND_WARNING_SEEN = 'dnd-warning-seen.v1';

export const NO_PREFERENCES: Preferences = { showEnglish: false, dndWarningSeen: false };

function marked(name: string): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return new File(Paths.document, name).exists;
  } catch {
    return false;
  }
}

function mark(name: string, on: boolean): void {
  if (Platform.OS === 'web') return;
  try {
    const file = new File(Paths.document, name);
    if (on) file.create({ overwrite: true });
    else if (file.exists) file.delete();
  } catch {
    // Not kept: asked again, or shown again, next launch.
  }
}

const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

export function readPreferences(): Preferences {
  return { showEnglish: marked(SHOW_ENGLISH), dndWarningSeen: marked(DND_WARNING_SEEN) };
}

/** Called whenever a preference changes, from anywhere. Returns the unsubscribe. */
export function onPreferencesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setShowEnglish(on: boolean): void {
  mark(SHOW_ENGLISH, on);
  changed();
}

export function setDndWarningSeen(seen: boolean): void {
  mark(DND_WARNING_SEEN, seen);
  changed();
}

/** Back to the defaults: part of erasing everything. */
export function forgetPreferences(): void {
  mark(SHOW_ENGLISH, false);
  mark(DND_WARNING_SEEN, false);
  changed();
}
