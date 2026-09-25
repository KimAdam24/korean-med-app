import { useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card, CardDivider } from '@/components/card';
import { Emblem } from '@/components/emblem';
import { Icon, type IconName } from '@/components/icon';
import { ALL_EDGES, Screen } from '@/components/screen';
import { Spacing } from '@/constants/theme';
import { useAppLock } from '@/features/security/app-lock-context';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate, type Bilingual } from '@/i18n/strings';

/**
 * The first launch, shown before the lock (see `LockGate`).
 *
 * Three short steps, each with one job, because each answers a question the
 * user would otherwise meet the hard way:
 *
 * 1. What the app does — and that it can misread, said before it ever does.
 * 2. Where the medicines live. The profile is on this phone only and is never
 *    backed up (see "does not survive a change of device" in the README); a
 *    user who first learns that from an empty list on a new phone has lost it.
 * 3. The camera, asked for with its reason just before the phone asks. A
 *    system prompt arriving cold, from an app the user has not used yet, is
 *    the one most often refused — and refusing it is sticky on both platforms.
 *
 * It comes before the lock because the lock opens with a fingerprint prompt,
 * and a prompt before any explanation is exactly the cold start this avoids.
 * Nothing here reads medication data, so nothing here needs to be locked.
 */
const STEPS = ['welcome', 'storage', 'camera'] as const;

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const back = index > 0 ? () => setIndex(index - 1) : undefined;

  // Android's back button steps back through the introduction rather than
  // closing the app from the middle of it.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index === 0) return false;
      setIndex(index - 1);
      return true;
    });
    return () => subscription.remove();
  }, [index]);

  // A screen reader stays on the button that was pressed, which now belongs to
  // a different step; say which one, so the change is not silent.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(TITLES[step].ko);
  }, [step]);

  const progress = fillTemplate(Strings.onboarding.step, { n: index + 1, total: STEPS.length });

  return (
    <Screen scroll centered edges={ALL_EDGES}>
      <Progress text={progress} />
      {step === 'welcome' ? (
        <Welcome onNext={() => setIndex(1)} />
      ) : step === 'storage' ? (
        <Storage onNext={() => setIndex(2)} onBack={back} />
      ) : (
        <CameraStep onDone={onDone} onBack={back} />
      )}
    </Screen>
  );
}

const TITLES = {
  welcome: Strings.onboarding.welcomeTitle,
  storage: Strings.onboarding.storageTitle,
  camera: Strings.onboarding.cameraTitle,
} as const;

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <>
      <Emblem icon="medicines" />
      <BilingualText text={Strings.onboarding.welcomeTitle} variant="heading" align="center" />
      <BilingualText text={Strings.onboarding.welcomeBody} align="center" />
      <BilingualText text={Strings.onboarding.welcomeCheck} variant="label" align="center" />
      <BigButton label={Strings.onboarding.next} onPress={onNext} />
    </>
  );
}

function Storage({ onNext, onBack }: { onNext: () => void; onBack?: () => void }) {
  return (
    <>
      <Emblem icon="lock" />
      <BilingualText text={Strings.onboarding.storageTitle} variant="heading" align="center" />
      <Card>
        <Fact icon="lock" text={Strings.onboarding.storageLocked} />
        <CardDivider />
        <Fact icon="phone" text={Strings.onboarding.storageNoBackup} />
        <CardDivider />
        <Fact icon="camera" text={Strings.onboarding.storagePhotos} />
        <CardDivider />
        <Fact icon="barcode" text={Strings.onboarding.storageLookup} />
      </Card>
      <BigButton label={Strings.onboarding.next} onPress={onNext} />
      {onBack && <BigButton label={Strings.onboarding.back} tone="secondary" onPress={onBack} />}
    </>
  );
}

/**
 * Asks for the camera only if the answer is still open. Already granted — a
 * reinstall, or a phone set up by a family member — or already refused for
 * good, the step says so and moves on; asking again would do nothing on
 * Android and show nothing on iOS.
 */
function CameraStep({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const { runWithSystemUi } = useAppLock();
  const [permission, requestPermission] = useCameraPermissions();
  const [asking, setAsking] = useState(false);

  const ask = async () => {
    setAsking(true);
    try {
      // The dialog is another activity on Android; see `runWithSystemUi`.
      await runWithSystemUi(() => requestPermission());
    } catch {
      // Refused or unavailable, the camera screen asks again in context.
    }
    // Whatever the answer: the introduction's job was to explain, not to insist.
    onDone();
  };

  return (
    <>
      <Emblem icon="camera" />
      <BilingualText text={Strings.onboarding.cameraTitle} variant="heading" align="center" />
      {!permission || asking ? (
        <ActivityIndicator size="large" />
      ) : permission.granted ? (
        <>
          <BilingualText text={Strings.onboarding.cameraReady} align="center" />
          <BigButton label={Strings.onboarding.start} onPress={onDone} />
        </>
      ) : permission.canAskAgain ? (
        <>
          <BilingualText text={Strings.onboarding.cameraBody} align="center" />
          <BigButton label={Strings.onboarding.askCamera} icon="camera" onPress={ask} />
          <BigButton label={Strings.onboarding.notNow} tone="secondary" onPress={onDone} />
        </>
      ) : (
        <>
          <BilingualText text={Strings.onboarding.cameraOff} align="center" />
          <BigButton label={Strings.onboarding.start} onPress={onDone} />
        </>
      )}
      {onBack && !asking && (
        <BigButton label={Strings.onboarding.back} tone="secondary" onPress={onBack} />
      )}
    </>
  );
}

function Progress({ text }: { text: Bilingual }) {
  const theme = useTheme();
  return <BilingualText text={text} variant="label" align="center" color={theme.textSecondary} />;
}

/** One statement in the storage card, with an icon that says what it is about. */
function Fact({ icon, text }: { icon: IconName; text: Bilingual }) {
  const theme = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} color={theme.primaryIcon} />
      <BilingualText text={text} style={styles.factText} />
    </View>
  );
}

const styles = StyleSheet.create({
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  factText: {
    flex: 1,
  },
});
