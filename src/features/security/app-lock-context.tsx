import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { Strings } from '@/i18n/strings';

import {
  cancelPendingUnlock,
  probeLockCapability,
  unlockWithDevice,
  type LockCapability,
  type UnlockOutcome,
} from './app-lock';
import { forgetPreviousInstall } from './install-marker';

/**
 * How long the app may sit behind system UI it opened before that stops
 * counting as the user still being here. Generous, because choosing a photo
 * can take a while for someone unfamiliar with the gallery; finite, because a
 * picker left open on a phone put down is not a reason to stay unlocked.
 */
const SYSTEM_UI_GRACE_MS = 5 * 60_000;

const lockIfUnlocked = (current: LockStatus): LockStatus =>
  current === 'unlocked' ? 'locked' : current;

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
  | 'unsupported'
  /**
   * The device could not be probed, even after retrying. It used to stay on
   * `checking` — a spinner with no way out but force-quitting the app.
   */
  | 'check-failed';

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
  /**
   * Re-probes the device — after a PIN is created, so `pinSet` stops being
   * stale, or to retry after `check-failed`. Throws if the probe fails.
   */
  readonly refresh: () => Promise<void>;
  /**
   * Runs an interaction that hands focus to the OS — a file picker, a
   * permission dialog — without the resulting `background` transition being
   * read as the user leaving the app.
   *
   * Anything that opens system UI *and* needs the calling screen to survive
   * until it returns must go through this. Without it the screen is unmounted
   * mid-interaction and the result arrives nowhere.
   *
   * Not for `Linking.openSettings()` and similar: that genuinely sends the user
   * elsewhere, and re-locking when they come back is correct.
   */
  readonly runWithSystemUi: <T>(action: () => Promise<T>) => Promise<T>;
};

const AppLockContext = createContext<AppLockValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LockStatus>('checking');
  const [capability, setCapability] = useState<LockCapability | null>(null);
  const [lastOutcome, setLastOutcome] = useState<UnlockOutcome | null>(null);

  /**
   * True while the OS authentication prompt is on screen. Guards against a
   * second prompt being opened on top of the first, which throws on iOS.
   */
  const authenticating = useRef(false);

  /**
   * How many system-UI interactions this app currently has open. Non-zero means
   * a `background` transition is the OS taking focus for something we asked
   * for, not the user walking away.
   */
  const systemUi = useRef(0);

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
    // A failed probe used to leave the lock screen on "checking" for good.
    // It is retried a few times before giving up; SecureStore failures are
    // transient far more often than not.
    const attempt = (remaining: number) => {
      probeLockCapability().then(
        (next) => {
          if (!cancelled) applyCapability(next);
        },
        () => {
          if (cancelled) return;
          if (remaining > 0) setTimeout(() => attempt(remaining - 1), 1000);
          else setStatus((current) => (current === 'checking' ? 'check-failed' : current));
        }
      );
    };
    // Before the first probe, which would otherwise find a previous
    // installation's PIN. Failure to check is not a reason to stop.
    forgetPreviousInstall()
      .catch(() => undefined)
      .finally(() => attempt(3));
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
   *
   * `background` is not sufficient on its own either. Android backgrounds this
   * activity whenever another one comes forward, including system UI that *we*
   * opened — a document picker, a permission dialog. The user has not left the
   * app in that case; the app asked the OS a question on their behalf. Locking
   * there tears down the screen that is waiting for the answer, so the answer
   * arrives to a component that no longer exists and the interaction silently
   * fails. `systemUi` marks those windows so they are not mistaken for leaving.
   */
  const backgroundedBehindSystemUi = useRef<number | null>(null);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'background') {
        // iOS never backgrounds the app for the system UI it opens — pickers,
        // permission alerts and Face ID all come up over it as `inactive` —
        // so there a background is the user leaving, whatever is open.
        if (systemUi.current === 0 || Platform.OS === 'ios') {
          setStatus(lockIfUnlocked);
        } else {
          backgroundedBehindSystemUi.current = Date.now();
        }
        return;
      }

      if (next === 'active' && backgroundedBehindSystemUi.current !== null) {
        const away = Date.now() - backgroundedBehindSystemUi.current;
        backgroundedBehindSystemUi.current = null;
        if (away <= SYSTEM_UI_GRACE_MS) return;

        // Gone too long to still be answering the picker. Anything still
        // counted as open is stuck — most likely a device prompt the system
        // dropped — and would otherwise keep the app unlocked, and the next
        // prompt blocked, for the rest of the session.
        setStatus(lockIfUnlocked);
        systemUi.current = 0;
        if (authenticating.current) {
          authenticating.current = false;
          void cancelPendingUnlock();
        }
      }
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  /**
   * Runs `action` without the backgrounding it causes being read as the user
   * leaving the app.
   *
   * A counter rather than a boolean: nesting is possible — a picker opened from
   * a screen that is itself mid-permission-request — and a boolean would be
   * cleared by whichever finished first, re-arming the lock while the other was
   * still open.
   *
   * The suppression lasts exactly as long as the call. It is deliberately not a
   * timer: the window should close when the OS hands control back, not after a
   * guessed interval.
   */
  const runWithSystemUi = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    systemUi.current += 1;
    try {
      return await action();
    } finally {
      systemUi.current = Math.max(0, systemUi.current - 1);
    }
  }, []);

  const requestDeviceUnlock = useCallback(async (): Promise<UnlockOutcome> => {
    if (authenticating.current) {
      // A second prompt while one is open throws on iOS; report the pending
      // attempt as a cancellation rather than surfacing a crash.
      return { kind: 'cancelled' };
    }

    authenticating.current = true;
    try {
      // The prompt is system UI too, and on some Android devices it briefly
      // backgrounds the app — which would re-lock during the very
      // authentication meant to unlock.
      const outcome = await runWithSystemUi(() =>
        unlockWithDevice(Strings.lock.prompt.ko, Strings.lock.cancel.ko)
      );
      setLastOutcome(outcome);
      if (outcome.kind === 'unlocked') setStatus('unlocked');
      return outcome;
    } finally {
      authenticating.current = false;
    }
  }, [runWithSystemUi]);

  const markUnlocked = useCallback(() => setStatus('unlocked'), []);
  const lock = useCallback(() => setStatus('locked'), []);

  const value = useMemo(
    () => ({
      status,
      capability,
      lastOutcome,
      requestDeviceUnlock,
      markUnlocked,
      lock,
      refresh,
      runWithSystemUi,
    }),
    [status, capability, lastOutcome, requestDeviceUnlock, markUnlocked, lock, refresh, runWithSystemUi]
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
