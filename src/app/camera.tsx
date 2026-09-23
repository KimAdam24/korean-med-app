import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
import { Card, CardDivider } from '@/components/card';
import { Notice, StatusBadge } from '@/components/notice';
import { Icon, type IconName } from '@/components/icon';
import { ReadingField } from '@/components/reading-field';
import { CameraChrome, Fonts, Radius, Spacing } from '@/constants/theme';
import { probeCapture, type CaptureProbe } from '@/features/capture/dev-capture-probe';
import { discardPickedCopy } from '@/features/capture/photo-caches';
import {
  PhotoNotDiscardedError,
  withTransientCapture,
} from '@/features/capture/transient-capture';
import { interpretBarcode } from '@/features/drugs/ndc';
import {
  fetchIngredients,
  resolveNdcCandidates,
  type DrugIdentity,
} from '@/features/drugs/rxnorm';
import { addMedication } from '@/features/medications/medication-store';
import { LabelOcr } from '../../modules/label-ocr';
import { interpretLines } from '@/features/ocr/interpret-lines';
import { goBackOr } from '@/features/navigation/go-back';
import { DevLineList, logRecognizedLines } from '@/features/ocr/dev-line-list';
import { assessField } from '@/features/ocr/field-integrity';
import { medicationFromReading } from '@/features/ocr/reading-to-record';
import { recognizeLabel } from '@/features/ocr/recognize-label';
import {
  type MedicationLabelFields,
  type ReadQuality,
  type RecognizedTextLine,
} from '@/features/ocr/types';
import { useAppLock } from '@/features/security/app-lock-context';
import { useTheme } from '@/hooks/use-theme';
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
  | { kind: 'saving' }
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

  /**
   * Whether this screen is still open. A barcode save waits on a network
   * lookup for up to several seconds; closed in the meantime, the user may
   * already be erasing everything in Settings, and a save landing afterwards
   * would put a medicine — and a new key — into the profile they just erased.
   */
  const open = useRef(true);
  useEffect(
    () => () => {
      open.current = false;
    },
    []
  );

  /**
   * Tells a screen-reader user, the moment a result appears, if any of it
   * could not be read.
   *
   * A sighted reader sees the amber panel at a glance. A screen-reader user
   * would otherwise meet it only by swiping down to it — after hearing a
   * clean-sounding name and dose first — which is exactly the order in which a
   * damaged direction is most likely to be taken at face value.
   */
  useEffect(() => {
    if (phase.kind !== 'result') return;

    if (phase.quality?.level === 'degraded') {
      AccessibilityInfo.announceForAccessibility(Strings.result.degradedTitle.ko);
      return;
    }

    for (const kind of ['instructions', 'dosage', 'name'] as const) {
      const text = phase.fields[kind]?.text;
      if (text && assessField(kind, text).level === 'damaged') {
        AccessibilityInfo.announceForAccessibility(Strings.result.damaged[kind].title.ko);
        return;
      }
    }
  }, [phase]);

  /**
   * When the screen is opened with an image already chosen, it reads that
   * instead of opening the camera.
   *
   * Deliberately reuses this screen rather than duplicating the result view:
   * both paths end in the same fields, the same quality verdict and the same
   * save, and two copies of that would drift.
   *
   * The picker never hands over the user's original — only a copy it wrote
   * into this app's cache, which is ours and is deleted once read, exactly as
   * a camera capture is. The original in the user's library is never touched.
   * If the copy cannot be deleted, that is reported instead of the reading,
   * as it is for the camera.
   */
  const { imageUri } = useLocalSearchParams<{ imageUri?: string }>();
  const readImported = useRef(false);

  useEffect(() => {
    if (!imageUri || readImported.current) return;
    readImported.current = true;

    (async () => {
      setPhase({ kind: 'reading' });
      let next: Phase;
      try {
        const lines = await LabelOcr.recognizeTextAsync(imageUri);
        // Development builds only, like the camera path: these lines are what
        // an evaluation entry is made from.
        logRecognizedLines('photo', lines);
        const result = interpretLines(lines);
        next =
          result.status === 'recognized'
            ? { kind: 'result', fields: result.fields, lines: result.lines, quality: result.quality }
            : { kind: 'problem', message: Strings.problem.unreadable, photoDiscarded: true };
      } catch {
        next = { kind: 'problem', message: Strings.problem.captureFailed, photoDiscarded: true };
      }

      try {
        discardPickedCopy(imageUri);
      } catch {
        next = { kind: 'problem', message: Strings.problem.notDiscarded, photoDiscarded: false };
      }
      setPhase(next);
    })();
  }, [imageUri]);

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
      /**
       * Fetched at save time rather than when interactions are checked, so the
       * check itself stays offline — an elderly user should not need signal to
       * find out two of their medicines do not mix. Failure yields an empty
       * list, which `checkInteractions` reports as unchecked rather than
       * treating as safe.
       */
      const ingredients = await fetchIngredients(drug.rxcui);
      if (!open.current) return;

      await addMedication({
        // RxNorm's concept name, verbatim. Not translated and not reformatted —
        // it is what the user will compare against the printed box.
        name: drug.name,
        source: 'label-scan',
        // The name came from an authoritative reference and the user has just
        // confirmed it against the carton, so there is nothing left to review.
        needsReview: false,
        identity: {
          rxcui: drug.rxcui,
          ndc11: drug.ndc11,
          ...(ingredients.length > 0 ? { ingredients } : {}),
        },
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

  /**
   * Saves what the label reader produced (spec §3.1 fallback, §3.3).
   *
   * Until this existed the OCR path could not add a medicine at all: it
   * displayed its reading and offered only "done". That left the entire
   * fallback route — the one covering pharmacy vials, which is most real
   * bottles — unable to reach the profile the app is built around.
   *
   * No RxNorm identity is attached, because there is none: OCR read text off a
   * label, it did not identify a product. The record is marked for review, so
   * the list keeps saying so until the user confirms it.
   *
   * Damaged directions and doses are left out rather than saved and flagged —
   * see `medicationFromReading` — so they cannot reappear on the medicine's own
   * page under "how to take it".
   */
  const saveFromLabel = useCallback(
    async (fields: MedicationLabelFields) => {
      const toSave = medicationFromReading(fields);
      if (!toSave) return;

      setPhase({ kind: 'saving' });
      try {
        await addMedication(toSave.record);
        setPhase({ kind: 'saved' });
      } catch {
        setPhase({
          kind: 'problem',
          message: Strings.vault.unrecoverableBody,
          photoDiscarded: true,
        });
      }
    },
    []
  );

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
  const close = useCallback(() => goBackOr(router, '/'), [router]);

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

  if (phase.kind === 'saving') {
    return (
      <Sheet>
        <ActivityIndicator size="large" />
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
      <ReadingResult
        fields={phase.fields}
        lines={phase.lines}
        quality={phase.quality}
        devProbe={devProbe}
        onSave={saveFromLabel}
        onRetake={retake}
        onClose={close}
      />
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
            <ActivityIndicator size="large" color={CameraChrome.foreground} />
            <BilingualText
              text={phase.kind === 'capturing' ? Strings.camera.capturing : Strings.camera.reading}
              align="center"
              onDark
            />
          </View>
        ) : (
          <View style={styles.controls}>
            <View style={styles.controlRow}>
              <IconControl label={Strings.camera.close} icon="close" onPress={close} />
              <Shutter onPress={handleCapture} />
              <IconControl
                label={torchOn ? Strings.camera.torchOff : Strings.camera.torchOn}
                icon={torchOn ? 'torchOn' : 'torchOff'}
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
 * What a label reading produced, in one of two shapes.
 *
 * ## A clean or partly damaged reading
 *
 * The fields are the point, so they lead. One calm notice asks the reader to
 * compare against the bottle, and a warning appears only on a field where
 * damage was actually found — specific, so it means something.
 *
 * ## A degraded reading
 *
 * Either the page itself read badly, or two of the three fields came back
 * missing or damaged — `assessReadQuality` decides, so this screen, the
 * development probe and the screen-reader announcement cannot disagree. A calm
 * "compare this with the bottle" over one usable field is the wrong register:
 * there is nothing to compare.
 *
 * Nothing in it should be relied on, so the fields stop leading. The first
 * version of this showed a warning banner and then a warning on every field,
 * each large and bilingual and saying nearly the same thing; the reader
 * scrolled through a wall of amber before reaching anything useful, and a
 * poor photograph read as a telling-off.
 *
 * Now there is one card: a heading marked with a small amber badge, one line
 * on how to get a better photo, and the retake button inside it, at the top,
 * where it is reachable without scrolling. Amber is an accent here, not a
 * background. The fields are still available behind a deliberate tap — some
 * labels never photograph cleanly, and saving must stay possible — but they
 * no longer stand between the reader and the thing to do next.
 *
 * The safety rule is unchanged in both: damaged text is never shown as a value.
 */
function ReadingResult({
  fields,
  lines,
  quality,
  devProbe,
  onSave,
  onRetake,
  onClose,
}: {
  fields: MedicationLabelFields;
  lines?: readonly RecognizedTextLine[];
  quality?: ReadQuality;
  devProbe: CaptureProbe | null;
  onSave: (fields: MedicationLabelFields) => void;
  onRetake: () => void;
  onClose: () => void;
}) {
  const degraded = quality?.level === 'degraded';
  const toSave = medicationFromReading(fields);
  // Local, so it starts closed on every new reading rather than inheriting
  // whatever the last one left.
  const [showFields, setShowFields] = useState(false);

  const fieldCards = (
    <>
      {/* The medicine: the name is what gets matched against the box. */}
      <Card>
        <ReadingField
          label={Strings.result.name}
          kind="name"
          text={fields.name?.text}
          assess
          prominent
          compact={degraded}
        />
        <CardDivider />
        <ReadingField
          label={Strings.result.dosage}
          kind="dosage"
          text={fields.dosage?.text}
          assess
          compact={degraded}
        />
      </Card>

      {/* The directions: the field whose damage is dangerous rather than untidy. */}
      <Card>
        <ReadingField
          label={Strings.result.instructions}
          kind="instructions"
          text={fields.instructions?.text}
          assess
          compact={degraded}
        />
      </Card>
    </>
  );

  const saveBlock = toSave ? (
    <View style={styles.actions}>
      {/* Said before the tap rather than after: what will be left out, and why. */}
      {toSave.dropped.includes('instructions') ? (
        <BilingualText text={Strings.result.notSavedInstructions} variant="label" />
      ) : null}
      {toSave.dropped.includes('dosage') ? (
        <BilingualText text={Strings.result.notSavedDosage} variant="label" />
      ) : null}
      {toSave.flagged.includes('name') ? (
        <BilingualText text={Strings.medications.saveUncheckedNotice} variant="label" />
      ) : null}
      <BigButton
        label={Strings.medications.saveFromLabel}
        onPress={() => onSave(fields)}
        tone={degraded ? 'secondary' : 'primary'}
      />
    </View>
  ) : null;

  if (degraded) {
    return (
      <Sheet scroll>
        <Card>
          <View style={styles.headingRow}>
            <StatusBadge tone="warn" />
            <BilingualText
              text={Strings.result.degradedTitle}
              variant="heading"
              style={styles.headingText}
            />
          </View>
          <BilingualText text={Strings.result.degradedBody} hideEnglish />
          <BigButton label={Strings.camera.retake} onPress={onRetake} />
        </Card>

        <BigButton
          label={showFields ? Strings.result.hideReading : Strings.result.showReading}
          onPress={() => setShowFields((shown) => !shown)}
          tone="secondary"
        />

        {showFields ? (
          <>
            {fieldCards}
            {saveBlock}
          </>
        ) : null}

        <BigButton label={Strings.camera.done} onPress={onClose} tone="secondary" />
        <DiscardNotice />

        <RawLinesPanel lines={lines} />
        <CapturedFramePanel probe={devProbe} />
      </Sheet>
    );
  }

  return (
    <Sheet scroll>
      <BilingualText text={Strings.result.title} variant="heading" />
      <Notice tone="info" title={Strings.result.compareWithBottle} />

      {fieldCards}

      <DiscardNotice />
      {saveBlock}

      <BigButton label={Strings.camera.retake} onPress={onRetake} tone="secondary" />
      <BigButton label={Strings.camera.done} onPress={onClose} tone="secondary" />

      <RawLinesPanel lines={lines} />
      <CapturedFramePanel probe={devProbe} />
    </Sheet>
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
    <Card>
      {/*
        Not judged for OCR damage: this name came from RxNorm, keyed by a
        verified barcode, not from reading a photograph.
      */}
      <ReadingField label={Strings.result.name} kind="name" text={drug.name} assess={false} prominent />
      <CardDivider />
      <ReadingField
        label={Strings.scan.codeLabel}
        kind="dosage"
        text={drug.ndcFormatted}
        assess={false}
      />
      {drug.packageStatus === 'OBSOLETE' ? (
        <Notice tone="info" title={Strings.scan.discontinued} />
      ) : null}
    </Card>
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
  icon,
  onPress,
  active = false,
}: {
  label: Bilingual;
  icon: IconName;
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
      {/* Inverted when on, so the state shows as well as the symbol. */}
      <Icon
        name={icon}
        color={active ? CameraChrome.background : CameraChrome.foreground}
        size={32}
      />
    </Pressable>
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
  const theme = useTheme();
  const content = <View style={styles.sheetContent}>{children}</View>;
  return (
    // The page colour sits behind cards so that a white card reads as an
    // object; on plain white, cards and page merge and the grouping is lost.
    <SafeAreaView style={[styles.sheet, { backgroundColor: theme.page }]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  actions: {
    gap: Spacing.three,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headingText: {
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
  choice: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  cameraRoot: {
    flex: 1,
    backgroundColor: CameraChrome.background,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  banner: {
    backgroundColor: CameraChrome.scrim,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    margin: Spacing.three,
    borderRadius: Radius.card,
    borderCurve: 'continuous',
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
    borderRadius: Radius.card,
    borderCurve: 'continuous',
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
    borderColor: CameraChrome.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: CameraChrome.foreground,
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
    backgroundColor: CameraChrome.scrim,
  },
  iconControlActive: {
    backgroundColor: CameraChrome.foreground,
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
