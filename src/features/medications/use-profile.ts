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
  | { readonly status: 'unrecoverable'; readonly reason: 'key-missing' | 'undecryptable' }
  /**
   * The read itself failed twice — a keychain call, not the data. It used to be
   * reported as `unrecoverable`, which told the user their list was gone and
   * pointed them at erasing it, for what is usually a hiccup.
   */
  | { readonly status: 'unavailable' };

export function useProfile(): {
  readonly state: ProfileState;
  readonly reload: () => Promise<void>;
} {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  const read = useCallback(async () => {
    setState(stateFor(await loadWithRetry()));
  }, []);

  // A `then` rather than calling `read`: state is set when the read answers,
  // never synchronously inside the effect.
  useEffect(() => {
    let cancelled = false;
    void loadWithRetry().then((result) => {
      if (!cancelled) setState(stateFor(result));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { state, reload: read };
}

/**
 * A thrown read — a keychain call that failed — is not the same as data that
 * cannot be decrypted, and often succeeds a moment later. It used to leave the
 * screen on "loading" for good. One retry, then the honest answer: unavailable,
 * with a way to try again.
 */
async function loadWithRetry(): Promise<ProfileLoadResult | 'failed'> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await loadProfile();
    } catch {
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return 'failed';
}

function stateFor(result: ProfileLoadResult | 'failed'): ProfileState {
  if (result === 'failed') return { status: 'unavailable' };
  switch (result.status) {
    case 'ok':
      return { status: 'ready', profile: result.value };
    case 'empty':
      // Nothing saved yet is a perfectly good profile with no medicines in
      // it, not a failure to read one.
      return { status: 'ready', profile: EMPTY_PROFILE };
    case 'unrecoverable':
      return { status: 'unrecoverable', reason: result.reason };
  }
}
