import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Spacing } from '@/constants/theme';
import {
  captureTransiently,
  PhotoNotDiscardedError,
} from '@/features/capture/transient-capture';
import { recognizeLabel } from '@/features/ocr/recognize-label';
import {
  needsConfirmation,
  type ExtractedField,
  type MedicationLabelFields,
} from '@/features/ocr/types';
import { Strings, type Bilingual } from '@/i18n/strings';

/**
 * Medication capture (spec §3.1).
 *
 * The camera preview is torn down as soon as a capture succeeds or fails, so
 * the sensor is not live while the user reads a result.
 */
type Phase =
  | { kind: 'preview' }
  | { kind: 'capturing' }
  | { kind: 'reading' }
  | { kind: 'result'; fields: MedicationLabelFields }
  /**
   * `photoDiscarded` is carried explicitly rather than assumed: every failure
   * path deletes the capture file except `PhotoNotDiscardedError`, which is
   * precisely the case where we must not reassure the user.
   */
  | { kind: 'problem'; message: Bilingual; photoDiscarded: boolean };

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'preview' });
  const [torchOn, setTorchOn] = useState(false);

  const cameraLive = phase.kind === 'preview' || phase.kind === 'capturing';

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) return;

    setPhase({ kind: 'capturing' });
    setTorchOn(false);

    try {
      // The image stays in this local scope. It is never written to state, a
      // ref, or a store, so it becomes unreachable as soon as this returns.
      const image = await captureTransiently(camera);
      setPhase({ kind: 'reading' });

      const result = await recognizeLabel(image);
      switch (result.status) {
        case 'recognized':
          setPhase({ kind: 'result', fields: result.fields });
          return;
        case 'unreadable':
          setPhase({
            kind: 'problem',
            message: Strings.problem.unreadable,
            photoDiscarded: true,
          });
          return;
        case 'not-configured':
          setPhase({
            kind: 'problem',
            message: Strings.problem.notConfigured,
            photoDiscarded: true,
          });
          return;
      }
    } catch (error) {
      const leaked = error instanceof PhotoNotDiscardedError;
      setPhase({
        kind: 'problem',
        message: leaked ? Strings.problem.notDiscarded : Strings.problem.captureFailed,
        photoDiscarded: !leaked,
      });
    }
  }, []);

  const handleMountError = useCallback(() => {
    setPhase({
      kind: 'problem',
      message:
        Platform.OS === 'web' ? Strings.problem.noCameraOnWeb : Strings.problem.captureFailed,
      photoDiscarded: true,
    });
  }, []);

  const retake = useCallback(() => setPhase({ kind: 'preview' }), []);
  const close = useCallback(() => router.back(), [router]);

  // `permission` is null only while the initial status check is in flight.
  if (!permission) {
    return (
      <Sheet>
        <ActivityIndicator size="large" />
        <BilingualText text={Strings.permission.checking} align="center" />
      </Sheet>
    );
  }

  if (!permission.granted) {
    return permission.canAskAgain ? (
      <Sheet>
        <BilingualText text={Strings.permission.askTitle} variant="heading" align="center" />
        <BilingualText text={Strings.permission.askBody} align="center" />
        <BigButton label={Strings.permission.allow} onPress={requestPermission} />
        <BigButton label={Strings.camera.close} onPress={close} tone="secondary" />
      </Sheet>
    ) : (
      <Sheet>
        <BilingualText text={Strings.permission.deniedTitle} variant="heading" align="center" />
        <BilingualText text={Strings.permission.deniedBody} align="center" />
        <BigButton label={Strings.permission.openSettings} onPress={() => Linking.openSettings()} />
        <BigButton label={Strings.camera.close} onPress={close} tone="secondary" />
      </Sheet>
    );
  }

  if (phase.kind === 'result') {
    return (
      <Sheet scroll>
        <BilingualText text={Strings.result.title} variant="heading" />
        <ReadField label={Strings.result.name} field={phase.fields.name} />
        <ReadField label={Strings.result.dosage} field={phase.fields.dosage} />
        <ReadField label={Strings.result.instructions} field={phase.fields.instructions} />
        <DiscardNotice />
        <BigButton label={Strings.camera.done} onPress={close} />
        <BigButton label={Strings.camera.retake} onPress={retake} tone="secondary" />
      </Sheet>
    );
  }

  if (phase.kind === 'problem') {
    return (
      <Sheet scroll>
        <BilingualText text={phase.message} variant="heading" />
        {phase.photoDiscarded && <DiscardNotice />}
        <BigButton label={Strings.camera.retake} onPress={retake} />
        <BigButton label={Strings.camera.close} onPress={close} tone="secondary" />
      </Sheet>
    );
  }

  return (
    <View style={styles.cameraRoot}>
      {cameraLive && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          enableTorch={torchOn}
          onMountError={handleMountError}
        />
      )}

      <SafeAreaView style={styles.overlay}>
        <View style={styles.banner}>
          <BilingualText
            text={Strings.camera.privacyBanner}
            variant="label"
            align="center"
            onDark
          />
        </View>

        <View style={styles.frameArea} pointerEvents="none">
          <View style={styles.frame} />
        </View>

        <View style={styles.hintArea}>
          <BilingualText text={Strings.camera.frameHint} align="center" onDark />
        </View>

        {phase.kind === 'capturing' || phase.kind === 'reading' ? (
          <View style={styles.controls}>
            <ActivityIndicator size="large" color="#ffffff" />
            <BilingualText
              text={phase.kind === 'capturing' ? Strings.camera.capturing : Strings.camera.reading}
              align="center"
              onDark
            />
          </View>
        ) : (
          <View style={styles.controls}>
            <View style={styles.controlRow}>
              <IconControl label={Strings.camera.close} glyph="✕" onPress={close} />
              <Shutter onPress={handleCapture} />
              <IconControl
                label={torchOn ? Strings.camera.torchOff : Strings.camera.torchOn}
                glyph="☀"
                active={torchOn}
                onPress={() => setTorchOn((on) => !on)}
              />
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function Shutter({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={Strings.camera.shutter.ko}
      hitSlop={Spacing.three}
      style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}>
      <View style={styles.shutterInner} />
    </Pressable>
  );
}

function IconControl({
  label,
  glyph,
  onPress,
  active = false,
}: {
  label: Bilingual;
  glyph: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label.ko}
      accessibilityState={{ selected: active }}
      hitSlop={Spacing.three}
      style={({ pressed }) => [
        styles.iconControl,
        active && styles.iconControlActive,
        pressed && styles.shutterPressed,
      ]}>
      <BilingualText
        text={{ ko: glyph, en: '' }}
        variant="button"
        align="center"
        onDark={!active}
      />
    </Pressable>
  );
}

function ReadField({ label, field }: { label: Bilingual; field?: ExtractedField }) {
  const unsure = needsConfirmation(field);
  return (
    <View style={styles.field}>
      <BilingualText text={label} variant="label" />
      <BilingualText text={{ ko: field?.text ?? '—', en: '' }} />
      {unsure && <BilingualText text={Strings.result.needsCheck} variant="label" />}
    </View>
  );
}

function DiscardNotice() {
  return (
    <View style={styles.notice}>
      <BilingualText text={Strings.camera.discarded} variant="label" />
    </View>
  );
}

function Sheet({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  const content = <View style={styles.sheetContent}>{children}</View>;
  return (
    <SafeAreaView style={styles.sheet}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  sheetContent: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  cameraRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  banner: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    margin: Spacing.three,
    borderRadius: Spacing.three,
  },
  frameArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  frame: {
    aspectRatio: 4 / 3,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: Spacing.three,
  },
  hintArea: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  controls: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.four,
    minHeight: 140,
    justifyContent: 'center',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  shutter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#ffffff',
  },
  shutterPressed: {
    opacity: 0.6,
  },
  iconControl: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  iconControlActive: {
    backgroundColor: '#ffffff',
  },
  field: {
    gap: Spacing.one,
  },
  notice: {
    paddingVertical: Spacing.two,
  },
});
