import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Emblem } from '@/components/emblem';
import { Notice } from '@/components/notice';
import { PinPad } from '@/components/pin-pad';
import { ALL_EDGES, Screen } from '@/components/screen';
import { clearProfile } from '@/features/medications/medication-store';
import { Strings, formatLockout, type Bilingual } from '@/i18n/strings';

import { useAppLock } from './app-lock-context';
import {
  PIN_LENGTH,
  clearPin,
  isWellFormedPin,
  lockoutRemainingMs,
  setPin,
  verifyPin,
} from './pin';

/**
 * The screen shown in front of the medication profile (spec §3.3).
 *
 * Two jobs that look like one: unlocking an existing profile, and creating a
 * PIN on a device that has no lock of its own. They share a keypad but not a
 * flow, so they are separate components below rather than one with a mode flag.
 */

export function LockScreen() {
  const { status, capability, requestDeviceUnlock, markUnlocked, refresh } = useAppLock();

  // Before the capability check below: a probe that failed never produced one.
  if (status === 'check-failed') {
    return <CheckFailed onRetry={refresh} />;
  }

  if (status === 'checking' || !capability) {
    return (
      <Sheet>
        <ActivityIndicator size="large" />
        <BilingualText text={Strings.lock.checking} align="center" />
      </Sheet>
    );
  }

  if (status === 'unsupported') {
    return (
      <Sheet>
        <BilingualText text={Strings.vault.unrecoverableTitle} variant="heading" align="center" />
        <BilingualText text={Strings.vault.unsupported} align="center" />
      </Sheet>
    );
  }

  if (status === 'needs-pin-setup') {
    return (
      <CreatePin
        onCreated={async () => {
          // The PIN is saved; a failed re-probe only leaves `pinSet` stale until
          // the next one, and must not strand the user on a full keypad.
          await refresh().catch(() => undefined);
          markUnlocked();
        }}
      />
    );
  }

  return (
    <Unlock
      canUseDevice={capability.deviceSecured}
      pinAvailable={capability.pinSet}
      onDeviceUnlock={requestDeviceUnlock}
      onPinAccepted={markUnlocked}
      // Re-probes when what the lock screen was built on has changed under it:
      // the phone's own lock removed, or the app PIN cleared.
      onStale={() => refresh().catch(() => undefined)}
      // Only where the phone has no lock of its own. There, nothing else can
      // prove who is holding it, so a forgotten PIN has one honest way out —
      // and it had none: the erase lived in Settings, behind this very lock.
      onEraseEverything={
        capability.deviceSecured
          ? undefined
          : async () => {
              await clearProfile();
              await clearPin();
              // Erased; see `onCreated` above for why a failed re-probe is not
              // reported as a failed erase.
              await refresh().catch(() => undefined);
            }
      }
    />
  );
}

// --- Unlocking an existing profile ---------------------------------------

function Unlock({
  canUseDevice,
  pinAvailable,
  onDeviceUnlock,
  onPinAccepted,
  onStale,
  onEraseEverything,
}: {
  canUseDevice: boolean;
  pinAvailable: boolean;
  onDeviceUnlock: () => Promise<{ kind: string }>;
  onPinAccepted: () => void;
  onStale: () => Promise<void>;
  onEraseEverything?: () => Promise<void>;
}) {
  // Start on the PIN when the OS has nothing to offer, so the user is not shown
  // a button that cannot work.
  const [showPin, setShowPin] = useState(!canUseDevice && pinAvailable);
  const [message, setMessage] = useState<Bilingual | null>(null);
  const [busy, setBusy] = useState(false);
  const prompted = useRef(false);

  const tryDevice = useCallback(async () => {
    setBusy(true);
    // "Try again, or use your PIN" only where there is a PIN to use.
    const failed = pinAvailable ? Strings.lock.rejected : Strings.failure.deviceUnlockFailed;
    try {
      const outcome = await onDeviceUnlock();
      switch (outcome.kind) {
        case 'unlocked':
        case 'cancelled':
          // Cancellation is a choice, not an error; leave the screen quiet.
          setMessage(null);
          return;
        case 'rejected':
          setMessage(failed);
          return;
        case 'unavailable':
          if (pinAvailable) {
            // The OS route is closed, so move the user to the one that is open.
            setMessage(Strings.lock.biometricUnavailable);
            setShowPin(true);
          } else {
            // No PIN to fall back on. Most likely the phone's own lock has been
            // removed since the app last looked; re-probing then moves this
            // phone to creating a PIN, rather than leaving a button that cannot
            // work under a message that says to use a PIN that does not exist.
            setMessage(Strings.failure.deviceUnlockOff);
            await onStale();
          }
          return;
        default:
          setMessage(failed);
      }
    } catch {
      // The prompt itself threw: no activity to show it on, an internal error.
      // It used to escape unhandled, leaving the button doing nothing.
      setMessage(failed);
    } finally {
      setBusy(false);
    }
  }, [onDeviceUnlock, onStale, pinAvailable]);

  /**
   * Prompt once, unattended, when the screen first appears — the behaviour of
   * every banking app this user has met. The ref guards against a second prompt
   * from a re-render, which throws on iOS while one is already open.
   *
   * Only while the app is in front. This screen also appears as the app goes
   * to the background — that is what locking on leave means — and a prompt
   * started then is dropped by Android without ever answering, which left the
   * unlock button doing nothing until the app was force-quit. It waits for the
   * user to come back instead.
   */
  useEffect(() => {
    if (prompted.current || showPin || !canUseDevice) return;

    const promptOnce = () => {
      if (prompted.current) return;
      prompted.current = true;
      void tryDevice();
    };

    if (AppState.currentState === 'active') {
      promptOnce();
      return;
    }
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') promptOnce();
    });
    return () => subscription.remove();
  }, [canUseDevice, showPin, tryDevice]);

  // Only while a PIN exists: one cleared underneath (see `onPinMissing`) sends
  // the user back to the phone's own lock, or on to creating a new PIN.
  if (showPin && pinAvailable) {
    return (
      <EnterPin
        message={message}
        onAccepted={onPinAccepted}
        onPinMissing={onStale}
        onEraseEverything={onEraseEverything}
        onUseDevice={canUseDevice ? () => {
          setMessage(null);
          setShowPin(false);
          void tryDevice();
        } : undefined}
      />
    );
  }

  return (
    <Sheet>
      <LockEmblem />
      <BilingualText text={Strings.lock.title} variant="heading" align="center" autoFocus />
      <BilingualText text={Strings.lock.body} align="center" />
      {message && <BilingualText text={message} variant="label" align="center" live />}

      {busy ? (
        <ActivityIndicator size="large" />
      ) : (
        <BigButton label={Strings.lock.unlock} onPress={tryDevice} />
      )}

      {pinAvailable && (
        <BigButton
          label={Strings.lock.usePin}
          tone="secondary"
          onPress={() => {
            setMessage(null);
            setShowPin(true);
          }}
        />
      )}
    </Sheet>
  );
}

function EnterPin({
  message,
  onAccepted,
  onPinMissing,
  onUseDevice,
  onEraseEverything,
}: {
  message: Bilingual | null;
  onAccepted: () => void;
  onPinMissing: () => Promise<void>;
  onUseDevice?: () => void;
  onEraseEverything?: () => Promise<void>;
}) {
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<Bilingual | null>(message);
  const [lockedMs, setLockedMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState<'no' | 'explain' | 'confirm' | 'erasing'>('no');
  const [eraseFailed, setEraseFailed] = useState(false);

  // A lockout begun in a previous session is still running; find out before the
  // user spends an attempt discovering it.
  useEffect(() => {
    lockoutRemainingMs().then(
      (remaining) => {
        if (remaining > 0) {
          setLockedMs(remaining);
          setError(formatLockout(Strings.pin.lockedOut, remaining));
        }
      },
      () => {
        // Unknown is not locked; the next attempt will say if it is.
      }
    );
  }, []);

  /**
   * Re-opens the keypad when a lockout ends. Nothing did: the pad stayed
   * disabled for good, under a message saying to try again in a minute.
   */
  useEffect(() => {
    if (lockedMs <= 0) return;
    const timer = setTimeout(() => {
      setLockedMs(0);
      setError(null);
    }, lockedMs);
    return () => clearTimeout(timer);
  }, [lockedMs]);

  const submit = useCallback(
    async (candidate: string) => {
      setBusy(true);
      try {
        const result = await verifyPin(candidate);
        switch (result.outcome) {
          case 'correct':
            onAccepted();
            return;
          case 'incorrect':
            setPinValue('');
            setLockedMs(result.lockedForMs);
            setError(
              result.lockedForMs > 0
                ? formatLockout(Strings.pin.lockedOut, result.lockedForMs)
                : Strings.pin.incorrect
            );
            return;
          case 'locked-out':
            setPinValue('');
            setLockedMs(result.lockedForMs);
            setError(formatLockout(Strings.pin.lockedOut, result.lockedForMs));
            return;
          case 'not-set':
            // Only reachable if the PIN was cleared underneath us. It used to
            // say face unlock was unavailable, on the PIN screen; re-probing
            // moves the user to whatever way in the phone actually has now.
            setPinValue('');
            await onPinMissing();
            return;
        }
      } catch {
        // A stored PIN record that cannot be read. Not a wrong guess, and not
        // a crash: the entry is cleared, it says so, and on a phone without its
        // own lock the way out below is still there.
        setPinValue('');
        setError(Strings.failure.pinCheckFailed);
      } finally {
        setBusy(false);
      }
    },
    [onAccepted, onPinMissing]
  );

  const change = (next: string) => {
    setError(null);
    setPinValue(next);
    // Submit on the last digit rather than behind a confirm button: one fewer
    // deliberate action, and the length is fixed so there is nothing to confirm.
    if (next.length === PIN_LENGTH) void submit(next);
  };

  if (forgot === 'erasing') {
    return (
      <Sheet>
        <ActivityIndicator size="large" />
      </Sheet>
    );
  }

  if (forgot === 'explain' && onEraseEverything) {
    return (
      <Sheet>
        <BilingualText text={Strings.settings.forgotPin} variant="heading" align="center" autoFocus />
        <BilingualText text={Strings.settings.forgotPinNoDevice} align="center" />
        <BigButton
          label={Strings.settings.eraseTitle}
          icon="erase"
          tone="caution"
          onPress={() => setForgot('confirm')}
        />
        <BigButton
          label={Strings.medications.cancel}
          tone="secondary"
          onPress={() => setForgot('no')}
        />
      </Sheet>
    );
  }

  if (forgot === 'confirm' && onEraseEverything) {
    // The same question Settings asks, with the way out first.
    return (
      <Sheet>
        <BilingualText text={Strings.settings.eraseTitle} variant="heading" align="center" autoFocus />
        {eraseFailed ? (
          <Notice
            live
            tone="warn"
            title={Strings.failure.eraseIncompleteTitle}
            body={Strings.failure.eraseIncompleteBody}
          />
        ) : null}
        <BilingualText text={Strings.settings.eraseBody} align="center" />
        <BigButton label={Strings.medications.cancel} onPress={() => setForgot('no')} />
        <BigButton
          label={Strings.settings.eraseConfirm}
          icon="erase"
          tone="caution"
          onPress={async () => {
            setForgot('erasing');
            try {
              await onEraseEverything();
            } catch {
              // Said, not silent: see the same case in Settings.
              setEraseFailed(true);
              setForgot('confirm');
            }
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet>
      <LockEmblem />
      <BilingualText text={Strings.pin.enterTitle} variant="heading" align="center" autoFocus />
      <BilingualText text={Strings.pin.enterBody} align="center" />
      {error && <BilingualText text={error} variant="label" align="center" live />}

      <PinPad value={pin} length={PIN_LENGTH} onChange={change} disabled={busy || lockedMs > 0} />

      {onUseDevice && (
        <BigButton label={Strings.lock.useDevice} tone="secondary" onPress={onUseDevice} />
      )}
      {onEraseEverything && (
        <BigButton
          label={Strings.settings.forgotPin}
          tone="secondary"
          onPress={() => setForgot('explain')}
        />
      )}
    </Sheet>
  );
}

// --- Creating a PIN on an unsecured device -------------------------------

function CreatePin({ onCreated }: { onCreated: () => Promise<void> }) {
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<Bilingual | null>(null);
  const [busy, setBusy] = useState(false);

  const change = useCallback(
    async (next: string) => {
      setError(null);
      setPinValue(next);
      if (next.length !== PIN_LENGTH) return;

      if (first === null) {
        // Guards against a keypad that could somehow emit a non-digit; the PIN
        // store rejects malformed input too, but not with a message the user sees.
        if (!isWellFormedPin(next)) {
          setPinValue('');
          return;
        }
        setFirst(next);
        setPinValue('');
        return;
      }

      if (next !== first) {
        // Restart from the beginning rather than re-asking for the confirmation:
        // when the two differ there is no way to know which one was the slip.
        setFirst(null);
        setPinValue('');
        setError(Strings.pin.mismatch);
        return;
      }

      setBusy(true);
      try {
        await setPin(next);
      } catch {
        // Not saved. Start again, and say so: a pad that silently went back to
        // "choose a PIN" after the confirmation looked like a mistyped one.
        setFirst(null);
        setPinValue('');
        setError(Strings.failure.pinNotSaved);
        setBusy(false);
        return;
      }
      await onCreated();
      setBusy(false);
    },
    [first, onCreated]
  );

  return (
    <Sheet>
      <BilingualText
        text={first === null ? Strings.pin.createTitle : Strings.pin.confirmTitle}
        variant="heading"
        align="center"
        // Refocuses when the title changes from "choose" to "once more".
        autoFocus
      />
      {first === null && <BilingualText text={Strings.pin.createBody} align="center" />}
      {error && <BilingualText text={error} variant="label" align="center" live />}

      <PinPad value={pin} length={PIN_LENGTH} onChange={change} disabled={busy} />
    </Sheet>
  );
}

// --- The device could not be checked ------------------------------------

/**
 * The lock probe failed even after retrying. Without this the screen stayed on
 * "checking" for good, and the only way out was force-quitting the app.
 */
function CheckFailed({ onRetry }: { onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <Sheet>
      <LockEmblem />
      <BilingualText text={Strings.failure.lockCheckFailedTitle} variant="heading" align="center" autoFocus />
      <BilingualText text={Strings.failure.lockCheckFailedBody} align="center" />
      {retrying ? (
        <ActivityIndicator size="large" />
      ) : (
        <BigButton
          label={Strings.scan.retry}
          onPress={async () => {
            setRetrying(true);
            // Success changes the lock's status and replaces this screen; a
            // failure leaves it here, with the button back.
            await onRetry().catch(() => undefined);
            setRetrying(false);
          }}
        />
      )}
    </Sheet>
  );
}

// --- Shared frame ---------------------------------------------------------

/**
 * The lock replaces the navigator, so there is no header above it and every
 * safe-area edge is its own.
 */
function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <Screen centered edges={ALL_EDGES}>
      {children}
    </Screen>
  );
}

/** Says "locked" before a word is read. */
function LockEmblem() {
  return <Emblem icon="lock" />;
}
