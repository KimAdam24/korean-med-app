import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Emblem } from '@/components/emblem';
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
    return <CreatePin onCreated={async () => {
      await refresh();
      markUnlocked();
    }} />;
  }

  return (
    <Unlock
      canUseDevice={capability.deviceSecured}
      pinAvailable={capability.pinSet}
      onDeviceUnlock={requestDeviceUnlock}
      onPinAccepted={markUnlocked}
      // Only where the phone has no lock of its own. There, nothing else can
      // prove who is holding it, so a forgotten PIN has one honest way out —
      // and it had none: the erase lived in Settings, behind this very lock.
      onEraseEverything={
        capability.deviceSecured
          ? undefined
          : async () => {
              await clearProfile();
              await clearPin();
              await refresh();
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
  onEraseEverything,
}: {
  canUseDevice: boolean;
  pinAvailable: boolean;
  onDeviceUnlock: () => Promise<{ kind: string }>;
  onPinAccepted: () => void;
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
    try {
      const outcome = await onDeviceUnlock();
      switch (outcome.kind) {
        case 'unlocked':
        case 'cancelled':
          // Cancellation is a choice, not an error; leave the screen quiet.
          setMessage(null);
          return;
        case 'rejected':
          setMessage(Strings.lock.rejected);
          return;
        case 'unavailable':
          setMessage(Strings.lock.biometricUnavailable);
          // The OS route is closed, so move the user to the one that is open.
          if (pinAvailable) setShowPin(true);
          return;
        default:
          setMessage(Strings.lock.rejected);
      }
    } finally {
      setBusy(false);
    }
  }, [onDeviceUnlock, pinAvailable]);

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

  if (showPin) {
    return (
      <EnterPin
        message={message}
        onAccepted={onPinAccepted}
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
      <BilingualText text={Strings.lock.title} variant="heading" align="center" />
      <BilingualText text={Strings.lock.body} align="center" />
      {message && <BilingualText text={message} variant="label" align="center" />}

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
  onUseDevice,
  onEraseEverything,
}: {
  message: Bilingual | null;
  onAccepted: () => void;
  onUseDevice?: () => void;
  onEraseEverything?: () => Promise<void>;
}) {
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<Bilingual | null>(message);
  const [lockedMs, setLockedMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState<'no' | 'explain' | 'confirm' | 'erasing'>('no');

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
            // Only reachable if the PIN was cleared underneath us.
            setPinValue('');
            setError(Strings.lock.biometricUnavailable);
        }
      } catch {
        // A stored PIN record that cannot be read. Not a wrong guess, and not
        // a crash: the entry is cleared, and on a phone without its own lock
        // the way out below is still there.
        setPinValue('');
        setError(Strings.lock.rejected);
      } finally {
        setBusy(false);
      }
    },
    [onAccepted]
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
      <Sheet scroll>
        <BilingualText text={Strings.settings.forgotPin} variant="heading" align="center" />
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
      <Sheet scroll>
        <BilingualText text={Strings.settings.eraseTitle} variant="heading" align="center" />
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
              setForgot('confirm');
            }
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet scroll>
      <LockEmblem />
      <BilingualText text={Strings.pin.enterTitle} variant="heading" align="center" />
      <BilingualText text={Strings.pin.enterBody} align="center" />
      {error && <BilingualText text={error} variant="label" align="center" />}

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

function CreatePin({ onCreated }: { onCreated: () => void }) {
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
        onCreated();
      } catch {
        // Not saved. Start again rather than leave a pad that did nothing.
        setFirst(null);
        setPinValue('');
      } finally {
        setBusy(false);
      }
    },
    [first, onCreated]
  );

  return (
    <Sheet scroll>
      <BilingualText
        text={first === null ? Strings.pin.createTitle : Strings.pin.confirmTitle}
        variant="heading"
        align="center"
      />
      {first === null && <BilingualText text={Strings.pin.createBody} align="center" />}
      {error && <BilingualText text={error} variant="label" align="center" />}

      <PinPad value={pin} length={PIN_LENGTH} onChange={change} disabled={busy} />
    </Sheet>
  );
}

// --- Shared frame ---------------------------------------------------------

/**
 * The lock replaces the navigator, so there is no header above it and every
 * safe-area edge is its own.
 */
function Sheet({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  return (
    <Screen scroll={scroll} centered edges={ALL_EDGES}>
      {children}
    </Screen>
  );
}

/** Says "locked" before a word is read. */
function LockEmblem() {
  return <Emblem icon="lock" />;
}
