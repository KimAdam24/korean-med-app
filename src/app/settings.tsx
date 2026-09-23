import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card, CardDivider } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { PinPad } from '@/components/pin-pad';
import { Screen } from '@/components/screen';
import { Spacing } from '@/constants/theme';
import { clearProfile } from '@/features/medications/medication-store';
import { goBackOr } from '@/features/navigation/go-back';
import { useAppLock } from '@/features/security/app-lock-context';
import { PIN_LENGTH, clearPin, setPin, verifyPin } from '@/features/security/pin';
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
  | { kind: 'forgot-pin' }
  | { kind: 'confirm-erase' }
  | { kind: 'working' }
  | { kind: 'done'; message: Bilingual };

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { capability, requestDeviceUnlock, refresh } = useAppLock();
  const [step, setStep] = useState<Step>({ kind: 'menu' });
  const [entry, setEntry] = useState('');
  // The pad is closed while a check runs, so a guess cannot be typed ahead of
  // the answer to the last one.
  const [checking, setChecking] = useState(false);

  const erase = useCallback(async () => {
    setStep({ kind: 'working' });
    try {
      // Order matters: the vault key goes first, which is the act that
      // actually makes the records unreadable. Clearing the PIN is tidying.
      await clearProfile();
      await clearPin();
      await refresh();
      setStep({ kind: 'done', message: Strings.settings.eraseDone });
    } catch {
      // Back to the question rather than a spinner that never ends. Nothing
      // may say "erased" unless it was; the user can try again from here.
      setStep({ kind: 'confirm-erase' });
    }
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
          setStep({ kind: 'change-pin', stage: 'current', error: Strings.lock.rejected });
          return;
        } finally {
          setChecking(false);
        }
        if (result.outcome === 'correct') {
          setStep({ kind: 'change-pin', stage: 'new' });
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
        await setPin(next);
        await refresh();
        setStep({ kind: 'done', message: Strings.settings.changePinDone });
      } catch {
        // The old PIN is still the PIN. Start the new one again.
        setStep({ kind: 'change-pin', stage: 'new' });
      }
    },
    [step, refresh]
  );

  /**
   * The device-unlock route back in. Succeeding here proves the same thing the
   * PIN would have, so a new one may be set without knowing the old.
   */
  const recoverWithDevice = useCallback(async () => {
    const outcome = await requestDeviceUnlock();
    if (outcome.kind !== 'unlocked') return;
    setEntry('');
    setStep({ kind: 'change-pin', stage: 'new' });
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
        <BilingualText text={step.message} variant="heading" align="center" />
        <BigButton label={Strings.camera.done} onPress={() => goBackOr(router, '/')} />
      </Screen>
    );
  }

  if (step.kind === 'confirm-erase') {
    return (
      <Screen centered>
        <BilingualText text={Strings.settings.eraseTitle} variant="heading" />
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
      <Screen scroll>
        <BilingualText text={Strings.settings.forgotPin} variant="heading" />

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
      <Screen scroll centered>
        <BilingualText text={title} variant="heading" align="center" />
        {step.error ? (
          <BilingualText text={step.error} variant="label" align="center" color={theme.warnText} />
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
    <Screen scroll>
      {/*
        Said here rather than buried in a policy document. Device-only storage
        is the trade this app makes for privacy, and the cost — a new phone
        means starting again — belongs somewhere the user will actually meet it.
      */}
      <Notice tone="info" title={Strings.settings.storageNotice} />

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
            <CardDivider inset />
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
