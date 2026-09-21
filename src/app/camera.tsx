import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Fonts, Spacing } from '@/constants/theme';
import { probeCapture, type CaptureProbe } from '@/features/capture/dev-capture-probe';
import {
  PhotoNotDiscardedError,
  withTransientCapture,
} from '@/features/capture/transient-capture';
import { interpretBarcode } from '@/features/drugs/ndc';
import { resolveNdcCandidates, type DrugIdentity } from '@/features/drugs/rxnorm';
import { addMedication } from '@/features/medications/medication-store';
import { DevLineList } from '@/features/ocr/dev-line-list';
import { recognizeLabel } from '@/features/ocr/recognize-label';
import {
  needsConfirmation,
  type ExtractedField,
  type MedicationLabelFields,
  type ReadQuality,
  type RecognizedTextLine,
} from '@/features/ocr/types';
import { useAppLock } from '@/features/security/app-lock-context';
import { Strings, type Bilingual } from '@/i18n/strings';

/**
 * Medication capture (spec §3.1).
 *
 * Two identification paths share one preview. The barcode is primary and runs
 * continuously without the user doing anything beyond pointing the phone —
 * which matters, because the target user should not have to understand the
 * difference between the two. The shutter is the fallback for a carton with no
 * readable barcode, and still routes to OCR.
 *
 * The camera preview is torn down as soon as either path produces a result, so
 * the sensor is not live while the user reads it.
 */
type Phase =
  | { kind: 'preview' }
  | { kind: 'capturing' }
  | { kind: 'reading' }
  /** A drug barcode was seen and the reference lookup is in flight. */
  | { kind: 'identifying' }
  | { kind: 'identified'; drug: DrugIdentity; saving: boolean }
  | { kind: 'ambiguous'; matches: readonly DrugIdentity[]; saving: boolean }
  | { kind: 'saved' }
  | {
      kind: 'result';
      fields: MedicationLabelFields;
      /** Carried only so the development-only panel can show it. */
      lines?: readonly RecognizedTextLine[];
      quality?: ReadQuality;
    }
  /**
   * `photoDiscarded` is carried explicitly rather than assumed: every failure
   * path deletes the capture file except `PhotoNotDiscardedError`, which is
   * precisely the case where we must not reassure the user.
   */
  | { kind: 'problem'; message: Bilingual; photoDiscarded: boolean; retry?: () => void };

/**
 * The symbologies a US drug package actually carries: a linear UPC/EAN on the
 * retail carton, and the GS1 DataMatrix that DSCSA serialisation mandates.
 * Listing them explicitly stops the scanner burning effort on QR codes and
 * postal symbols that cannot contain an NDC.
 */
const DRUG_BARCODE_TYPES = ['upc_a', 'ean13', 'datamatrix', 'code128'] as const;

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'preview' });
  const [torchOn, setTorchOn] = useState(false);
  /**
   * The frame the camera actually returned, for development diagnosis. Always
   * null in a release build — `probeCapture` returns null outside `__DEV__`.
   */
  const [devProbe, setDevProbe] = useState<CaptureProbe | null>(null);
  const { runWithSystemUi } = useAppLock();

  /**
   * The Android permission dialog is another activity, so granting camera
   * access backgrounds this one. Unguarded, that re-locks the app and unmounts
   * this screen at the exact moment the user says yes — they authenticate, and
   * land back on the home screen with the permission granted and nothing to
   * show for it.
   */
  const askForCamera = useCallback(
    () => runWithSystemUi(async () => {
      await requestPermission();
    }),
    [requestPermission, runWithSystemUi]
  );

  /**
   * `onBarcodeScanned` fires on every frame that contains a symbol, so without
   * a latch a single bottle would launch a lookup per frame. A ref rather than
   * state because the callback must see the update immediately, not after the
   * next render.
   */
  const scanning = useRef(false);

  const cameraLive = phase.kind === 'preview' || phase.kind === 'capturing';

  const handleBarcode = useCallback(async (scan: BarcodeScanningResult) => {
    if (scanning.current) return;
    scanning.current = true;

    try {
      // Decided locally and instantly. A loyalty card or a tin of beans must
      // not interrupt the preview or reach the network, so anything that is not
      // a drug code simply releases the latch and scanning continues in silence.
      const interpreted = interpretBarcode({ type: scan.type, data: scan.data });
      if (interpreted.status !== 'ndc-candidates') return;

      setPhase({ kind: 'identifying' });
      const resolution = await resolveNdcCandidates(interpreted.candidates);

      switch (resolution.status) {
        case 'identified':
          setPhase({ kind: 'identified', drug: resolution.drug, saving: false });
          return;
        case 'ambiguous':
          setPhase({ kind: 'ambiguous', matches: resolution.matches, saving: false });
          return;
        case 'unknown':
          setPhase({
            kind: 'problem',
            message: Strings.scan.unrecognisedBody,
            photoDiscarded: true,
          });
          return;
        case 'offline':
          setPhase({
            kind: 'problem',
            message: Strings.scan.offlineBody,
            photoDiscarded: true,
            // Offline is the one failure worth retrying as-is; the others need
            // a different bottle or a different method.
            retry: () => setPhase({ kind: 'preview' }),
          });
      }
    } finally {
      // Released only for paths that stay on the preview; once the phase has
      // moved on the camera unmounts and no further scans arrive anyway.
      scanning.current = false;
    }
  }, []);

  const saveDrug = useCallback(async (drug: DrugIdentity) => {
    setPhase((current) =>
      current.kind === 'identified' || current.kind === 'ambiguous'
        ? { ...current, saving: true }
        : current
    );

    try {
      await addMedication({
        // RxNorm's concept name, verbatim. Not translated and not reformatted —
        // it is what the user will compare against the printed box.
        name: drug.name,
        source: 'label-scan',
        // The name came from an authoritative reference and the user has just
        // confirmed it against the carton, so there is nothing left to review.
        needsReview: false,
        identity: { rxcui: drug.rxcui, ndc11: drug.ndc11 },
      });
      setPhase({ kind: 'saved' });
    } catch {
      setPhase({
        kind: 'problem',
        message: Strings.vault.unrecoverableBody,
        photoDiscarded: true,
      });
    }
  }, []);

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) return;

    setPhase({ kind: 'capturing' });
    setTorchOn(false);

    try {
      // Recognition runs inside the capture window, while the file still
      // exists. Nothing about the image escapes this callback — the photo is
      // deleted before `withTransientCapture` returns, and only the extracted
      // text survives.
      const result = await withTransientCapture(camera, async (image) => {
        setPhase({ kind: 'reading' });
        // Development-only, and compiled out of release. Must happen inside the
        // window, while the file still exists.
        setDevProbe(await probeCapture(image));
        return recognizeLabel(image);
      });

      switch (result.status) {
        case 'recognized':
          setPhase({
            kind: 'result',
            fields: result.fields,
            lines: result.lines,
            quality: result.quality,
          });
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

  const retake = useCallback(() => {
    scanning.current = false;
    setPhase({ kind: 'preview' });
  }, []);
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
        <BigButton label={Strings.permission.allow} onPress={askForCamera} />
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

  if (phase.kind === 'identifying') {
    return (
      <Sheet>
        <ActivityIndicator size="large" />
        <BilingualText text={Strings.scan.looking} align="center" />
      </Sheet>
    );
  }

  if (phase.kind === 'identified') {
    return (
      <Sheet scroll>
        <BilingualText text={Strings.scan.foundTitle} variant="heading" />
        <DrugCard drug={phase.drug} />
        <BilingualText text={Strings.scan.foundBody} variant="label" />
        {phase.saving ? (
          <ActivityIndicator size="large" />
        ) : (
          <BigButton label={Strings.scan.save} onPress={() => saveDrug(phase.drug)} />
        )}
        <BigButton label={Strings.scan.scanAgain} onPress={retake} tone="secondary" />
        <BigButton label={Strings.camera.close} onPress={close} tone="secondary" />
      </Sheet>
    );
  }

  if (phase.kind === 'ambiguous') {
    return (
      <Sheet scroll>
        <BilingualText text={Strings.scan.ambiguousTitle} variant="heading" />
        <BilingualText text={Strings.scan.ambiguousBody} />
        {phase.matches.map((match) => (
          <View key={match.ndc11} style={styles.choice}>
            <DrugCard drug={match} />
            <BigButton
              label={Strings.scan.save}
              onPress={() => saveDrug(match)}
              disabled={phase.saving}
            />
          </View>
        ))}
        <BigButton label={Strings.scan.scanAgain} onPress={retake} tone="secondary" />
      </Sheet>
    );
  }

  if (phase.kind === 'saved') {
    return (
      <Sheet>
        <BilingualText text={Strings.scan.saved} variant="heading" align="center" />
        <BigButton label={Strings.scan.scanAgain} onPress={retake} />
        <BigButton label={Strings.camera.done} onPress={close} tone="secondary" />
      </Sheet>
    );
  }

  if (phase.kind === 'result') {
    return (
      <Sheet scroll>
        {phase.quality?.level === 'degraded' ? (
          /*
           * Replaces the heading rather than sitting beside it. A warning shown
           * next to a tidy list of fields reads as a footnote, and the whole
           * point is that these fields should not be trusted enough to confirm.
           */
          <View style={styles.field}>
            <BilingualText text={Strings.result.degradedTitle} variant="heading" />
            <BilingualText text={Strings.result.degradedBody} />
          </View>
        ) : (
          <BilingualText text={Strings.result.title} variant="heading" />
        )}
        <ReadField label={Strings.result.name} field={phase.fields.name} />
        <ReadField label={Strings.result.dosage} field={phase.fields.dosage} />
        <ReadField label={Strings.result.instructions} field={phase.fields.instructions} />
        <RawLinesPanel lines={phase.lines} />
        <CapturedFramePanel probe={devProbe} />
        <DiscardNotice />
        {phase.quality?.level === 'degraded' ? (
          <>
            <BigButton label={Strings.camera.retake} onPress={retake} />
            <BigButton label={Strings.camera.done} onPress={close} tone="secondary" />
          </>
        ) : (
          <>
            <BigButton label={Strings.camera.done} onPress={close} />
            <BigButton label={Strings.camera.retake} onPress={retake} tone="secondary" />
          </>
        )}
      </Sheet>
    );
  }

  if (phase.kind === 'problem') {
    return (
      <Sheet scroll>
        <BilingualText text={phase.message} variant="heading" />
        <CapturedFramePanel probe={devProbe} />
        {phase.photoDiscarded && <DiscardNotice />}
        <BigButton
          label={phase.retry ? Strings.scan.retry : Strings.camera.retake}
          onPress={phase.retry ?? retake}
        />
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
          barcodeScannerSettings={{ barcodeTypes: [...DRUG_BARCODE_TYPES] }}
          // Detached while a photo is being taken so a stray frame cannot start
          // a lookup on top of a capture already under way.
          onBarcodeScanned={phase.kind === 'preview' ? handleBarcode : undefined}
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
          <BilingualText text={Strings.scan.hint} align="center" onDark />
          <BilingualText text={Strings.scan.orPhoto} variant="label" align="center" onDark />
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

/**
 * The identified medicine.
 *
 * The name is rendered through `BilingualText` with an empty English line
 * because it is already English and must not be paired with a translation —
 * this is the one string on the screen that has to match the box exactly.
 */
function DrugCard({ drug }: { drug: DrugIdentity }) {
  return (
    <View style={styles.card}>
      <BilingualText text={{ ko: drug.name, en: '' }} variant="heading" />
      <BilingualText text={Strings.scan.codeLabel} variant="label" />
      <BilingualText text={{ ko: drug.ndcFormatted, en: '' }} />
      {drug.packageStatus === 'OBSOLETE' && (
        <BilingualText text={Strings.scan.discontinued} variant="label" />
      )}
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

/**
 * Shows the engine's raw output on the device, for capturing a real label while
 * the sig parser is being written.
 *
 * Development-only, for the same reason the console log is: these lines are the
 * text printed on someone's medication, and §4 keeps that to the user. The
 * whole component compiles out of a release bundle because `__DEV__` is
 * statically false there.
 *
 * `selectable` so the text can be copied off the phone directly — pulling it
 * out of `adb logcat` works too, but not everyone testing this will have a
 * cable to hand.
 */
function RawLinesPanel({ lines }: { lines?: readonly RecognizedTextLine[] }) {
  if (!__DEV__ || !lines || lines.length === 0) return null;

  return (
    <View style={styles.rawPanel}>
      <BilingualText
        text={{ ko: `읽은 원문 ${lines.length}줄 (개발용)`, en: `Raw OCR: ${lines.length} lines (dev only)` }}
        variant="label"
      />
      <DevLineList lines={lines} />
    </View>
  );
}

/**
 * Shows the frame the camera actually returned, beside the text read from it.
 *
 * This is the panel that distinguishes "recognition is wrong" from "the camera
 * photographed something else entirely" — a distinction the OCR output alone
 * cannot make, because a recogniser reading a synthetic test frame correctly
 * looks identical to one reading a real label badly.
 *
 * Development-only. `probe` is always null in a release build, so this renders
 * nothing and the photograph is never encoded.
 */
function CapturedFramePanel({ probe }: { probe: CaptureProbe | null }) {
  if (!__DEV__ || !probe) return null;

  const kilobytes = Math.round(probe.byteLength / 1024);

  return (
    <View style={styles.rawPanel}>
      <BilingualText
        text={{
          ko: '찍힌 사진 (개발용)',
          en: 'Captured frame (dev only)',
        }}
        variant="label"
      />
      <Image
        source={{ uri: probe.previewDataUrl }}
        style={styles.framePreview}
        resizeMode="contain"
        accessible={false}
      />
      <Text selectable style={styles.rawText}>
        {`${probe.width}x${probe.height}  ${kilobytes} KB\n${probe.uri}`}
      </Text>
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
  card: {
    gap: Spacing.one,
  },
  choice: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
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
    gap: Spacing.two,
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
  framePreview: {
    width: '100%',
    height: 220,
    backgroundColor: '#00000010',
    borderRadius: 8,
  },
  rawPanel: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  rawText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.mono,
    color: '#60646C',
  },
  notice: {
    paddingVertical: Spacing.two,
  },
});
