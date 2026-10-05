/**
 * What each approved-uses lookup found, for this unlocked session.
 *
 * The card that shows a medicine's uses is unmounted and mounted again often:
 * opening fill-in and coming back, confirming or editing a medicine, opening
 * its page again. Each time it asked RxNav and DailyMed afresh: the
 * medicine's name sent again, and up to a few hundred kilobytes of label
 * downloaded again, for the same answer. Kept here instead, by what was
 * looked up.
 *
 * Forgotten when the app locks and when everything is erased: nothing about
 * the user's medicines stays in memory behind the lock. "Could not be
 * reached" is never kept, so trying again asks again.
 */
const MAX_KEPT = 50;
const kept = new Map<string, unknown>();

export function recallLookup<T>(key: string): T | undefined {
  return kept.get(key) as T | undefined;
}

export function rememberLookup(key: string, value: unknown): void {
  kept.delete(key);
  kept.set(key, value);
  // The oldest go first, past a few screens' worth.
  while (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value as string);
}

export function forgetLookups(): void {
  kept.clear();
}
