import { useCallback, useEffect, useState } from 'react';

import { loadProfile, type ProfileLoadResult } from './medication-store';
import { EMPTY_PROFILE, type MedicationProfile } from './types';

/**
 * Loads the medication profile, and reloads it on demand.
 *
 * Every screen that shows medicines needs the same four outcomes — loading,
 * empty, readable, unreadable — and the fourth is the one worth centralising.
 * `unrecoverable` means saved data exists that cannot be decrypted, and the
 * temptation everywhere is to fall back to an empty list. Showing someone an
 * empty medicine list when they have medicines is not a degraded experience,
 * it is a false statement about their treatment, so the state is kept distinct
 * all the way to the screen.
 */
export type ProfileState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly profile: MedicationProfile }
  | { readonly status: 'unrecoverable'; readonly reason: 'key-missing' | 'undecryptable' };

export function useProfile(): {
  readonly state: ProfileState;
  readonly reload: () => Promise<void>;
} {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  const read = useCallback(async () => {
    const result: ProfileLoadResult = await loadProfile();

    switch (result.status) {
      case 'ok':
        setState({ status: 'ready', profile: result.value });
        return;
      case 'empty':
        // Nothing saved yet is a perfectly good profile with no medicines in
        // it, not a failure to read one.
        setState({ status: 'ready', profile: EMPTY_PROFILE });
        return;
      case 'unrecoverable':
        setState({ status: 'unrecoverable', reason: result.reason });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadProfile().then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') setState({ status: 'ready', profile: result.value });
      else if (result.status === 'empty') setState({ status: 'ready', profile: EMPTY_PROFILE });
      else setState({ status: 'unrecoverable', reason: result.reason });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { state, reload: read };
}
