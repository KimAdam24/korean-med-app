import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card, CardDivider } from '@/components/card';
import { ListRow, SwitchRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { PinPad } from '@/components/pin-pad';
import { Screen } from '@/components/screen';
import { Spacing } from '@/constants/theme';
import { goBackOr } from '@/features/navigation/go-back';
import { setShowEnglish } from '@/features/preferences/preferences';
import { usePreferences } from '@/features/preferences/preferences-context';
import { useAppLock } from '@/features/security/app-lock-context';
import { eraseEverything } from '@/features/security/erase';
import { PIN_LENGTH, setPin, verifyPin } from '@/features/security/pin';
import { useTheme } from '@/hooks/use-theme';
import { Strings, formatLockout, type Bilingual } from '@/i18n/strings';

/**
 * Managing the lock and the stored data.
 *
 * Both things here were already implemented and unreachable, which made them
 * worse than missing. A user who forgot their PIN was locked out of their own
 * medication list permanently, and "erase my data" existed only as a function
 * no screen called.
 *
 * ## What forgetting a PIN can honestly offer
 *
 * The app PIN is a gate, not a key — the vault's encryption key is independent
 * and lives in the keychain. So "recovery" is a question of proving identity
 * some other way, and there are exactly two answers:
 *
 *   - The phone has its own lock. Then unlocking the phone proves as much as
 *     the app PIN ever did, and a new PIN can simply be set.
 *   - It does not. Then nothing else distinguishes the owner from a finder,
 *     and offering a way in would mean the lock never meant anything. The only
 *     honest option is to erase and start again, said plainly with its cost.
 */
type Step =
  | { kind: 'menu' }
  /**
   * `confirm` carries the first entry. A new PIN is entered twice, as it is
   * when first set: one mistyped digit here would otherwise lock the user out
   * of their own list, recoverable only by device unlock or erasing it all.
   */
  | {
      kind: 'change-pin';
      stage: 'current' | 'new' | 'confirm';
      first?: string;
      error?: Bilingual;
    }
  | { kind: 'forgot-pin'; error?: Bilingual }
  /** `failed`: the last attempt did not finish, and some of it may have happened. */
  | { kind: 'confirm-erase'; failed?: boolean }
  | { kind: 'working' }
  | { kind: 'done'; message: Bilingual };

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { showEnglish } = usePreferences();
  const { capability, requestDeviceUnlock, refresh } = useAppLock();
  const [step, setStep] = useState<Step>({ kind: 'menu' });
  const [entry, setEntry] = useState('');
  // The pad is closed while a check runs, so a guess cannot be typed ahead of
  // the answer to the last one.
  const [checking, setChecking] = useState(false);

  const erase = useCallback(async () => {
    setStep({ kind: 'working' });
    try {
      // Reminders, then the vault key — the act that actually makes the
      // records unreadable — then the PIN. See `eraseEverything`.
      await eraseEverything();
    } catch {
      // Back to the question, saying it did not finish. It used to return in
      // silence — and because the key goes first, a failure clearing the PIN
      // left the medicines erased behind a screen that looked untouched.
      // Trying again finishes the job either way.
      setStep({ kind: 'confirm-erase', failed: true });
      return;
    }
    // Erased. Re-reading the lock's state is housekeeping: if it fails, the
    // next launch re-reads it, and it must not turn a finished erase into a
    // reported failure.
    await refresh().catch(() => undefined);
    setStep({ kind: 'done', message: Strings.settings.eraseDone });
  }, [refresh]);

  const handlePinEntry = useCallback(
    async (next: string) => {
      setEntry(next);
      if (next.length !== PIN_LENGTH || step.kind !== 'change-pin') return;
      setEntry('');

      if (step.stage === 'current') {
        setChecking(true);
        let result: Awaited<ReturnType<typeof verifyPin>>;
        try {
          result = await verifyPin(next);
        } catch {
          setStep({ kind: 'change-pin', stage: 'current', error: Strings.failure.pinCheckFailed });
          return;
        } finally {
          setChecking(false);
        }
        if (result.outcome === 'correct') {
          setStep({ kind: 'change-pin', stage: 'new' });
        } else if (result.outcome === 'not-set') {
          // No PIN to check against — cleared underneath, most likely by an
          // erase whose re-probe failed. "Not correct" would be false; re-probe
          // so this menu stops offering to change a PIN that does not exist.
          void refresh().catch(() => undefined);
          setStep({ kind: 'change-pin', stage: 'current', error: Strings.failure.pinCheckFailed });
        } else {
          setStep({
            kind: 'change-pin',
            stage: 'current',
            // A lock-out says how long to wait, as it does on the lock
            // screen; "not correct" alone would invite more attempts that
            // cannot succeed yet.
            error:
              result.outcome === 'locked-out' ||
              (result.outcome === 'incorrect' && result.lockedForMs > 0)
                ? formatLockout(Strings.pin.lockedOut, result.lockedForMs)
                : Strings.pin.incorrect,
          });
        }
        return;
      }

      if (step.stage === 'new') {
        setStep({ kind: 'change-pin', stage: 'confirm', first: next });
        return;
      }

      if (next !== step.first) {
        setStep({
          kind: 'change-pin',
          stage: 'new',
          error: Strings.pin.mismatch,
        });
        return;
      }

      setStep({ kind: 'working' });
      try {
        // A throw here means the PIN did not change; see `setPin`.
        await setPin(next);
      } catch {
        setStep({ kind: 'change-pin', stage: 'new', error: Strings.failure.pinNotChanged });
        return;
      }
      await refresh().catch(() => undefined);
      setStep({ kind: 'done', message: Strings.settings.changePinDone });
    },
    [step, refresh]
  );

  /**
   * The device-unlock route back in. Succeeding here proves the same thing the
   * PIN would have, so a new one may be set without knowing the old.
   */
  const recoverWithDevice = useCallback(async () => {
    let outcome: Awaited<ReturnType<typeof requestDeviceUnlock>>;
    try {
      outcome = await requestDeviceUnlock();
    } catch {
      setStep({ kind: 'forgot-pin', error: Strings.failure.deviceUnlockFailed });
      return;
    }
    if (outcome.kind === 'unlocked') {
      setEntry('');
      setStep({ kind: 'change-pin', stage: 'new' });
      return;
    }
    // Cancelling is a choice and stays quiet. Anything else used to be silent
    // too, leaving a button that appeared to do nothing.
    setStep({
      kind: 'forgot-pin',
      error:
        outcome.kind === 'cancelled'
          ? undefined
          : outcome.kind === 'unavailable'
            ? Strings.failure.deviceUnlockOff
            : Strings.failure.deviceUnlockFailed,
    });
  }, [requestDeviceUnlock]);

  if (step.kind === 'working') {
    return (
      <Screen centered>
        <ActivityIndicator size="large" color={theme.primaryIcon} />
      </Screen>
    );
  }

  if (step.kind === 'done') {
    return (
      <Screen centered>
        <BilingualText text={step.message} variant="heading" align="center" autoFocus />
        <BigButton label={Strings.camera.done} onPress={() => goBackOr(router, '/')} />
      </Screen>
    );
  }

  if (step.kind === 'confirm-erase') {
    return (
      <Screen centered>
        <BilingualText text={Strings.settings.eraseTitle} variant="heading" autoFocus />
        {step.failed ? (
          <Notice
            live
            tone="warn"
            title={Strings.failure.eraseIncompleteTitle}
            body={Strings.failure.eraseIncompleteBody}
          />
        ) : null}
        <BilingualText text={Strings.settings.eraseBody} />
        {/* Way out first and primary; the destructive action second, marked. */}
        <BigButton label={Strings.medications.cancel} onPress={() => setStep({ kind: 'menu' })} />
        <BigButton
          label={Strings.settings.eraseConfirm}
          icon="erase"
          tone="caution"
          onPress={erase}
        />
      </Screen>
    );
  }

  if (step.kind === 'forgot-pin') {
    const canUseDevice = capability?.deviceSecured ?? false;

    return (
      <Screen>
        <BilingualText text={Strings.settings.forgotPin} variant="heading" autoFocus />
        {step.error ? <Notice tone="warn" title={step.error} live /> : null}

        {canUseDevice ? (
          <>
            <BilingualText text={Strings.settings.forgotPinWithDevice} />
            <BigButton label={Strings.settings.forgotPinUseDevice} onPress={recoverWithDevice} />
          </>
        ) : (
          <>
            <BilingualText text={Strings.settings.forgotPinNoDevice} />
            <BigButton
              label={Strings.settings.eraseTitle}
              icon="erase"
              tone="caution"
              onPress={() => setStep({ kind: 'confirm-erase' })}
            />
          </>
        )}

        <BigButton
          label={Strings.medications.cancel}
          tone="secondary"
          onPress={() => setStep({ kind: 'menu' })}
        />
      </Screen>
    );
  }

  if (step.kind === 'change-pin') {
    const title =
      step.stage === 'current'
        ? Strings.settings.changePinCurrent
        : step.stage === 'new'
          ? Strings.settings.changePinNew
          : Strings.pin.confirmTitle;

    return (
      <Screen centered>
        <BilingualText text={title} variant="heading" align="center" autoFocus />
        {step.error ? (
          <BilingualText text={step.error} variant="label" align="center" color={theme.warnText} live />
        ) : null}

        <PinPad
          value={entry}
          length={PIN_LENGTH}
          onChange={handlePinEntry}
          disabled={checking}
        />

        <View style={styles.pinActions}>
          {step.stage === 'current' ? (
            <BigButton
              label={Strings.settings.forgotPin}
              tone="secondary"
              onPress={() => setStep({ kind: 'forgot-pin' })}
            />
          ) : null}

          <BigButton
            label={Strings.medications.cancel}
            tone="secondary"
            onPress={() => {
              setEntry('');
              setStep({ kind: 'menu' });
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/*
        Said here rather than buried in a policy document. Device-only storage
        is the trade this app makes for privacy, and the cost — a new phone
        means starting again — belongs somewhere the user will actually meet it.
      */}
      <Notice tone="info" title={Strings.settings.storageNotice} />

      {/* For a family member or a pharmacist: off, the app is Korean only. */}
      <Card flush>
        <SwitchRow icon="language" title={Strings.settings.showEnglish} value={showEnglish} onValueChange={setShowEnglish} />
      </Card>

      <Card flush>
        {capability?.pinSet ? (
          <>
            <ListRow
              icon="key"
              title={Strings.settings.changePin}
              onPress={() => {
                setEntry('');
                setStep({ kind: 'change-pin', stage: 'current' });
              }}
            />
            <CardDivider />
          </>
        ) : null}

        <ListRow
          icon="erase"
          tone="caution"
          title={Strings.settings.eraseTitle}
          onPress={() => setStep({ kind: 'confirm-erase' })}
        />
      </Card>

      <View style={styles.spacer} />
      <BigButton label={Strings.camera.close} onPress={() => goBackOr(router, '/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pinActions: {
    gap: Spacing.three,
  },
  spacer: {
    flex: 1,
    minHeight: Spacing.four,
  },
});
