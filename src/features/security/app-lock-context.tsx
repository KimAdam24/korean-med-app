import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { Strings } from '@/i18n/strings';

import { probeLockCapability, unlockWithDevice, type LockCapability, type UnlockOutcome } from './app-lock';

/**
 * Holds whether the app is currently unlocked (spec §3.3).
 *
 * State lives in one place because two things need to agree on it: the gate
 * that hides the medication profile, and the background handler that re-locks.
 * Threading that through props would make it possible for a screen to hold a
 * stale `unlocked` and render data after the app had re-locked.
 */

export type LockStatus =
  /** Probing the device. Nothing is shown until this resolves. */
  | 'checking'
  | 'locked'
  | 'unlocked'
  /** The device has no lock of its own, so an app PIN must be created first. */
  | 'needs-pin-setup'
  /** No secure storage on this platform; the profile is unavailable, not merely locked. */
  | 'unsupported';

export type AppLockValue = {
  readonly status: LockStatus;
  readonly capability: LockCapability | null;
  /** Result of the most recent device-unlock attempt, for the lock screen to explain. */
  readonly lastOutcome: UnlockOutcome | null;
  /** Runs the OS prompt. Safe to call repeatedly; concurrent calls are ignored. */
  readonly requestDeviceUnlock: () => Promise<UnlockOutcome>;
  /** Called by the PIN flow once a PIN has been verified or newly set. */
  readonly markUnlocked: () => void;
  readonly lock: () => void;
  /** Re-probes after a PIN is created, so `pinSet` stops being stale. */
  readonly refresh: () => Promise<void>;
};

const AppLockContext = createContext<AppLockValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LockStatus>('checking');
  const [capability, setCapability] = useState<LockCapability | null>(null);
  const [lastOutcome, setLastOutcome] = useState<UnlockOutcome | null>(null);

  /**
   * True while the OS prompt is on screen. The prompt pushes the app to
   * `inactive` (and on some Android devices briefly to `background`), so
   * without this the re-lock handler would fire during the very authentication
   * meant to unlock, and the user would loop.
   */
  const authenticating = useRef(false);

  const applyCapability = useCallback((next: LockCapability) => {
    setCapability(next);
    setStatus((current) => {
      if (next.unsupported) return 'unsupported';
      // A device with no lock and no PIN cannot protect anything yet.
      if (next.pinRequired && !next.pinSet) return 'needs-pin-setup';
      // Never downgrade an already-unlocked session on a re-probe.
      return current === 'unlocked' ? 'unlocked' : 'locked';
    });
  }, []);

  const refresh = useCallback(async () => {
    applyCapability(await probeLockCapability());
  }, [applyCapability]);

  useEffect(() => {
    let cancelled = false;
    probeLockCapability().then((next) => {
      if (!cancelled) applyCapability(next);
    });
    return () => {
      cancelled = true;
    };
  }, [applyCapability]);

  /**
   * Re-locks when the app leaves the foreground.
   *
   * Only on `background`, never `inactive`: iOS reports `inactive` for the
   * notification shade, an incoming call banner, and the biometric prompt
   * itself. Locking on those would be hostile — and in the prompt's case,
   * self-defeating.
   */
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'background' && !authenticating.current) {
        setStatus((current) => (current === 'unlocked' ? 'locked' : current));
      }
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  const requestDeviceUnlock = useCallback(async (): Promise<UnlockOutcome> => {
    if (authenticating.current) {
      // A second prompt while one is open throws on iOS; report the pending
      // attempt as a cancellation rather than surfacing a crash.
      return { kind: 'cancelled' };
    }

    authenticating.current = true;
    try {
      const outcome = await unlockWithDevice(Strings.lock.prompt.ko, Strings.lock.cancel.ko);
      setLastOutcome(outcome);
      if (outcome.kind === 'unlocked') setStatus('unlocked');
      return outcome;
    } finally {
      authenticating.current = false;
    }
  }, []);

  const markUnlocked = useCallback(() => setStatus('unlocked'), []);
  const lock = useCallback(() => setStatus('locked'), []);

  const value = useMemo(
    () => ({ status, capability, lastOutcome, requestDeviceUnlock, markUnlocked, lock, refresh }),
    [status, capability, lastOutcome, requestDeviceUnlock, markUnlocked, lock, refresh]
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockValue {
  const value = useContext(AppLockContext);
  if (!value) {
    throw new Error('useAppLock must be used inside an AppLockProvider.');
  }
  return value;
}
