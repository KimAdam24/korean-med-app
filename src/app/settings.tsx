import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { PinPad } from '@/components/pin-pad';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { clearProfile } from '@/features/medications/medication-store';
import { useAppLock } from '@/features/security/app-lock-context';
import { PIN_LENGTH, clearPin, setPin, verifyPin } from '@/features/security/pin';
import { Strings, type Bilingual } from '@/i18n/strings';

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
type Screen =
  | { kind: 'menu' }
  | { kind: 'change-pin'; stage: 'current' | 'new'; error?: Bilingual }
  | { kind: 'forgot-pin' }
  | { kind: 'confirm-erase' }
  | { kind: 'working' }
  | { kind: 'done'; message: Bilingual };

export default function SettingsScreen() {
  const router = useRouter();
  const { capability, requestDeviceUnlock, refresh } = useAppLock();
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });
  const [entry, setEntry] = useState('');

  const erase = useCallback(async () => {
    setScreen({ kind: 'working' });
    // Order matters: the vault key goes first, which is the act that actually
    // makes the records unreadable. Clearing the PIN afterwards is tidying.
    await clearProfile();
    await clearPin();
    await refresh();
    setScreen({ kind: 'done', message: Strings.settings.eraseDone });
  }, [refresh]);

  const handlePinEntry = useCallback(
    async (next: string) => {
      setEntry(next);
      if (next.length !== PIN_LENGTH || screen.kind !== 'change-pin') return;

      if (screen.stage === 'current') {
        const result = await verifyPin(next);
        setEntry('');
        if (result.outcome === 'correct') {
          setScreen({ kind: 'change-pin', stage: 'new' });
        } else {
          setScreen({ kind: 'change-pin', stage: 'current', error: Strings.pin.incorrect });
        }
        return;
      }

      setScreen({ kind: 'working' });
      await setPin(next);
      setEntry('');
      await refresh();
      setScreen({ kind: 'done', message: Strings.settings.changePinDone });
    },
    [screen, refresh]
  );

  /**
   * The device-unlock route back in. Succeeding here proves the same thing the
   * PIN would have, so a new one may be set without knowing the old.
   */
  const recoverWithDevice = useCallback(async () => {
    const outcome = await requestDeviceUnlock();
    if (outcome.kind !== 'unlocked') return;
    setEntry('');
    setScreen({ kind: 'change-pin', stage: 'new' });
  }, [requestDeviceUnlock]);

  if (screen.kind === 'working') {
    return (
      <Sheet>
        <ActivityIndicator size="large" />
      </Sheet>
    );
  }

  if (screen.kind === 'done') {
    return (
      <Sheet>
        <BilingualText text={screen.message} variant="heading" align="center" />
        <BigButton label={Strings.camera.done} onPress={() => router.back()} />
      </Sheet>
    );
  }

  if (screen.kind === 'confirm-erase') {
    return (
      <Sheet>
        <BilingualText text={Strings.settings.eraseTitle} variant="heading" />
        <BilingualText text={Strings.settings.eraseBody} />
        {/* Way out first, destructive action second. */}
        <BigButton
          label={Strings.medications.cancel}
          onPress={() => setScreen({ kind: 'menu' })}
        />
        <BigButton label={Strings.settings.eraseConfirm} tone="secondary" onPress={erase} />
      </Sheet>
    );
  }

  if (screen.kind === 'forgot-pin') {
    const canUseDevice = capability?.deviceSecured ?? false;

    return (
      <Sheet scroll>
        <BilingualText text={Strings.settings.forgotPin} variant="heading" />

        {canUseDevice ? (
          <>
            <BilingualText text={Strings.settings.forgotPinWithDevice} />
            <BigButton
              label={Strings.settings.forgotPinUseDevice}
              onPress={recoverWithDevice}
            />
          </>
        ) : (
          <>
            <BilingualText text={Strings.settings.forgotPinNoDevice} />
            <BigButton
              label={Strings.settings.eraseTitle}
              tone="secondary"
              onPress={() => setScreen({ kind: 'confirm-erase' })}
            />
          </>
        )}

        <BigButton
          label={Strings.medications.cancel}
          tone="secondary"
          onPress={() => setScreen({ kind: 'menu' })}
        />
      </Sheet>
    );
  }

  if (screen.kind === 'change-pin') {
    return (
      <Sheet scroll>
        <BilingualText
          text={
            screen.stage === 'current'
              ? Strings.settings.changePinCurrent
              : Strings.settings.changePinNew
          }
          variant="heading"
          align="center"
        />
        {screen.error ? (
          <BilingualText text={screen.error} variant="label" align="center" />
        ) : null}

        <PinPad value={entry} length={PIN_LENGTH} onChange={handlePinEntry} />

        {screen.stage === 'current' ? (
          <BigButton
            label={Strings.settings.forgotPin}
            tone="secondary"
            onPress={() => setScreen({ kind: 'forgot-pin' })}
          />
        ) : null}

        <BigButton
          label={Strings.medications.cancel}
          tone="secondary"
          onPress={() => {
            setEntry('');
            setScreen({ kind: 'menu' });
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet scroll>
      {/*
        Said here rather than buried in a policy document. Device-only storage
        is the trade this app makes for privacy, and the cost — a new phone
        means starting again — belongs somewhere the user will actually meet it.
      */}
      <BilingualText text={Strings.settings.storageNotice} />

      {capability?.pinSet ? (
        <BigButton
          label={Strings.settings.changePin}
          tone="secondary"
          onPress={() => {
            setEntry('');
            setScreen({ kind: 'change-pin', stage: 'current' });
          }}
        />
      ) : null}

      <BigButton
        label={Strings.settings.eraseTitle}
        tone="secondary"
        onPress={() => setScreen({ kind: 'confirm-erase' })}
      />

      <View style={styles.spacer} />
      <BigButton label={Strings.camera.close} onPress={() => router.back()} />
    </Sheet>
  );
}

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
    gap: Spacing.three,
    padding: Spacing.four,
  },
  spacer: {
    flex: 1,
    minHeight: Spacing.four,
  },
});
