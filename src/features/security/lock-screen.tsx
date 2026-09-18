import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { PinPad } from '@/components/pin-pad';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Strings, formatLockout, type Bilingual } from '@/i18n/strings';

import { useAppLock } from './app-lock-context';
import { PIN_LENGTH, isWellFormedPin, lockoutRemainingMs, setPin, verifyPin } from './pin';

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
    />
  );
}

// --- Unlocking an existing profile ---------------------------------------

function Unlock({
  canUseDevice,
  pinAvailable,
  onDeviceUnlock,
  onPinAccepted,
}: {
  canUseDevice: boolean;
  pinAvailable: boolean;
  onDeviceUnlock: () => Promise<{ kind: string }>;
  onPinAccepted: () => void;
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
   */
  useEffect(() => {
    if (prompted.current || showPin || !canUseDevice) return;
    prompted.current = true;
    void tryDevice();
  }, [canUseDevice, showPin, tryDevice]);

  if (showPin) {
    return (
      <EnterPin
        message={message}
        onAccepted={onPinAccepted}
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
}: {
  message: Bilingual | null;
  onAccepted: () => void;
  onUseDevice?: () => void;
}) {
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState<Bilingual | null>(message);
  const [lockedMs, setLockedMs] = useState(0);
  const [busy, setBusy] = useState(false);

  // A lockout begun in a previous session is still running; find out before the
  // user spends an attempt discovering it.
  useEffect(() => {
    lockoutRemainingMs().then((remaining) => {
      if (remaining > 0) {
        setLockedMs(remaining);
        setError(formatLockout(Strings.pin.lockedOut, remaining));
      }
    });
  }, []);

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

  return (
    <Sheet scroll>
      <BilingualText text={Strings.pin.enterTitle} variant="heading" align="center" />
      <BilingualText text={Strings.pin.enterBody} align="center" />
      {error && <BilingualText text={error} variant="label" align="center" />}

      <PinPad value={pin} length={PIN_LENGTH} onChange={change} disabled={busy || lockedMs > 0} />

      {onUseDevice && (
        <BigButton label={Strings.lock.useDevice} tone="secondary" onPress={onUseDevice} />
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

function Sheet({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  const content = <View style={styles.content}>{children}</View>;
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView>
        ) : (
          content
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: Spacing.four,
    padding: Spacing.four,
  },
});
