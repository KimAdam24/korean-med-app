import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Speaks `text` through the screen reader whenever it appears or changes.
 *
 * For messages that arrive after an action — "that PIN is not correct", "your
 * changes were not saved" — which a sighted user sees at once and a screen
 * reader user otherwise never hears: the focus is still on the button they
 * pressed, and nothing tells them to go looking. Nothing is said when there is
 * no screen reader running.
 *
 * The same text twice in a row is said once; callers clear their message
 * between attempts (the PIN screens do, on the next key), so a repeated error
 * is repeated aloud too.
 */
export function useAnnouncement(text: string | null | undefined): void {
  useEffect(() => {
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}
