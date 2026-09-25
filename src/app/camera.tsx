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
import { isCutAtEdge, type EdgeTruncation } from '@/features/ocr/truncation';
import { recognizeLabel } from '@/features/ocr/recognize-label';
import { FillInPanel } from '@/features/ocr/fill-in-panel';
import { findGaps } from '@/features/ocr/fill-in';
import type { MergedReading } from '@/features/ocr/sweep/merge';
import { SweepReader, type SweepEnding } from '@/features/ocr/sweep/sweep-reader';
import {
  type LabelRecognitionResult,
  type MedicationLabelFields,
  type ReadQuality,
  type RecognizedTextLine,
} from '@/features/ocr/types';
import { sweepAvailable } from '../../modules/label-sweep';
import { useAppLock } from '@/features/security/app-lock-context';
import { VaultUnreadableError } from '@/features/security/secure-vault';
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
  /** Reading the label while the user turns the bottle; see `SweepReader`. */
  | { kind: 'sweeping' }
  | {
      kind: 'result';
      fields: MedicationLabelFields;
      /**
       * The lines the fields were read from: for the development-only panel,
       * and for filling in what could not be read. Text, like the fields, and
       * gone with the screen.
       */
      lines?: readonly RecognizedTextLine[];
      quality?: ReadQuality;
      truncation?: EdgeTruncation | null;
      /** Read while turning the bottle: no photograph was taken for it. */
      swept?: boolean;
      /** The sweep ended itself, having read nothing new for a while. */
      stalled?: boolean;
      /** The user typed part of it in from the bottle. */
      filled?: boolean;
    }
  /**
   * `photoDiscarded` is carried explicitly rather than assumed: every failure
   * path deletes the capture file except `PhotoNotDiscardedError`, which is
   * precisely the case where we must not reassure the user.
   */
  | {
      kind: 'problem';
      /** Heading, when the message needs one; otherwise the message is the heading. */
      title?: Bilingual;
      message: Bilingual;
      photoDiscarded: boolean;
      retry?: () => void;
    };

/**
 * The symbologies a US drug package actually carries: a linear UPC/EAN on the
 * retail carton, and the GS1 DataMatrix that DSCSA serialisation mandates.
 * Listing them explicitly stops the scanner burning effort on QR codes and
 * postal symbols that cannot contain an NDC.
 */
const DRUG_BARCODE_TYPES = ['upc_a', 'ean13', 'datamatrix', 'code128'] as const;

/**
 * How far text over the live preview may grow with the system text size.
 * Everywhere else it grows to the system's own body size, but here the banner,
 * the two hints and the controls share the screen with the viewfinder; grown
 * that far they covered it, and the frame the label is lined up in shrank to a
 * sliver. 1.4x of sizes already well above the default is still large.
 */
const OVERLAY_MAX_SCALE = 1.4;

type Recognised = Extract<LabelRecognitionResult, { status: 'recognized' }>;

const resultPhase = (
  result: Recognised,
  how: { swept?: boolean; stalled?: boolean; filled?: boolean } = {}
): Extract<Phase, { kind: 'result' }> => ({
  kind: 'result',
  fields: result.fields,
  lines: result.lines,
  quality: result.quality,
  truncation: result.truncation,
  ...how,
});

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
    () =>
      runWithSystemUi(async () => {
        await requestPermission();
      }).catch(() => {
        // The status is unchanged, so this screen still offers to ask again.
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
            ? resultPhase(result)
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

  /** The reading on screen, kept so a failed save can go back to it. */
  const lastReading = useRef<Extract<Phase, { kind: 'result' }> | null>(null);
  useEffect(() => {
    if (phase.kind === 'result') lastReading.current = phase;
  }, [phase]);

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
        // A barcode lookup takes no photograph, so none of these says one was
        // deleted; they used to, which told the user of a photo never taken.
        case 'unknown':
          setPhase({
            kind: 'problem',
            title: Strings.scan.unrecognisedTitle,
            message: Strings.scan.unrecognisedBody,
            photoDiscarded: false,
          });
          return;
        case 'offline':
          setPhase({
            kind: 'problem',
            title: Strings.scan.offlineTitle,
            message: Strings.scan.offlineBody,
            photoDiscarded: false,
            // Offline is worth retrying as-is; `unknown` needs a different
            // bottle or a different method.
            retry: () => setPhase({ kind: 'preview' }),
          });
          return;
        case 'unavailable':
          setPhase({
            kind: 'problem',
            title: Strings.scan.offlineTitle,
            message: Strings.failure.lookupUnavailable,
            photoDiscarded: false,
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
    } catch (error) {
      setPhase(saveProblem(error, () => setPhase({ kind: 'identified', drug, saving: false })));
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
    async (fields: MedicationLabelFields, truncation?: EdgeTruncation | null) => {
      const toSave = medicationFromReading(fields, truncation);
      if (!toSave) return;

      const reading = lastReading.current;
      setPhase({ kind: 'saving' });
      try {
        await addMedication(toSave.record);
        setPhase({ kind: 'saved' });
      } catch (error) {
        // Back to the same reading, not the camera: the photo is gone, and
        // "retake" after a failed save threw away a reading that was fine.
        setPhase(saveProblem(error, reading ? () => setPhase(reading) : undefined));
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
          setPhase(resultPhase(result));
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

  /**
   * The sweep, offered when a reading ran off the edge of a curved label. Its
   * reading replaces the photograph's whole — the two are never blended — and
   * cancelling it goes back to the photograph's.
   */
  const startSweep = useCallback(() => {
    setTorchOn(false);
    // The last photograph's frame is not what the sweep read.
    setDevProbe(null);
    setPhase({ kind: 'sweeping' });
  }, []);
  const sweepDone = useCallback((merged: MergedReading | null, ending: SweepEnding) => {
    if (!open.current) return;
    setPhase(
      merged
        ? resultPhase(merged.result, { swept: true, stalled: ending === 'stalled' })
        : { kind: 'problem', message: Strings.problem.unreadable, photoDiscarded: false }
    );
  }, []);
  const sweepCancelled = useCallback(() => setPhase(lastReading.current ?? { kind: 'preview' }), []);

  /** The same reading with the user's words in it, already judged whole and confirmed. */
  const filledIn = useCallback((reading: Recognised) => {
    setPhase((current) =>
      current.kind === 'result' ? resultPhase(reading, { swept: current.swept, filled: true }) : current
    );
  }, []);
  const close = useCallback(() => goBackOr(router, '/'), [router]);

  // `permission` is null only while the initial status check is in flight.
  if (!permission) {
    return (
      <Sheet>
        <ActivityIndicator size="large" />
        <BilingualText text={Strings.permission.checking} align="center" />
        {/*
          A status check that fails never answers, and this is a full-screen
          modal: without a button here it was a spinner with no way out.
        */}
        <BigButton label={Strings.camera.close} onPress={close} tone="secondary" />
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
        <BigButton
          label={Strings.permission.openSettings}
          onPress={() => void Linking.openSettings().catch(() => undefined)}
        />
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
        <BigButton label={Strings.camera.close} onPress={close} tone="secondary" />
      </Sheet>
    );
  }

  if (phase.kind === 'identified') {
    return (
      <Sheet>
        <BilingualText text={Strings.scan.foundTitle} variant="heading" autoFocus />
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
      <Sheet>
        <BilingualText text={Strings.scan.ambiguousTitle} variant="heading" autoFocus />
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
        <BilingualText text={Strings.scan.saved} variant="heading" align="center" autoFocus />
        <BigButton label={Strings.scan.scanAgain} onPress={retake} />
        <BigButton label={Strings.camera.done} onPress={close} tone="secondary" />
      </Sheet>
    );
  }

  if (phase.kind === 'sweeping') {
    return <SweepReader onDone={sweepDone} onCancel={sweepCancelled} />;
  }

  if (phase.kind === 'result') {
    return (
      <ReadingResult
        fields={phase.fields}
        lines={phase.lines}
        quality={phase.quality}
        truncation={phase.truncation}
        swept={phase.swept}
        stalled={phase.stalled}
        filled={phase.filled}
        devProbe={devProbe}
        onSave={saveFromLabel}
        onRetake={retake}
        onSweep={sweepAvailable ? startSweep : undefined}
        onFilled={filledIn}
        onClose={close}
      />
    );
  }

  if (phase.kind === 'problem') {
    return (
      <Sheet>
        {phase.title ? (
          <>
            <BilingualText text={phase.title} variant="heading" autoFocus />
            <BilingualText text={phase.message} />
          </>
        ) : (
          <BilingualText text={phase.message} variant="heading" autoFocus />
        )}
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
            maxScale={OVERLAY_MAX_SCALE}
          />
        </View>

        <View style={styles.frameArea} pointerEvents="none">
          <View style={styles.frame} />
        </View>

        <View style={styles.hintArea}>
          <BilingualText text={Strings.scan.hint} align="center" onDark maxScale={OVERLAY_MAX_SCALE} />
          <BilingualText
            text={Strings.scan.orPhoto}
            variant="label"
            align="center"
            onDark
            maxScale={OVERLAY_MAX_SCALE}
          />
        </View>

        {phase.kind === 'capturing' || phase.kind === 'reading' ? (
          <View style={styles.controls}>
            <ActivityIndicator size="large" color={CameraChrome.foreground} />
            <BilingualText
              text={phase.kind === 'capturing' ? Strings.camera.capturing : Strings.camera.reading}
              align="center"
              onDark
              maxScale={OVERLAY_MAX_SCALE}
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
 *
 * ## Getting the rest
 *
 * When a curved label ran out of sight, and this phone can, the curve notice
 * offers to read it again while the bottle is turned (`onSweep`). Whatever is
 * still withheld after that, or on a phone without the sweep, can be filled in
 * by hand, one gap at a time, from the bottle (`FillInPanel`).
 */
function ReadingResult({
  fields,
  lines,
  quality,
  truncation,
  swept = false,
  stalled = false,
  filled = false,
  devProbe,
  onSave,
  onRetake,
  onSweep,
  onFilled,
  onClose,
}: {
  fields: MedicationLabelFields;
  lines?: readonly RecognizedTextLine[];
  quality?: ReadQuality;
  truncation?: EdgeTruncation | null;
  swept?: boolean;
  stalled?: boolean;
  filled?: boolean;
  devProbe: CaptureProbe | null;
  onSave: (fields: MedicationLabelFields, truncation?: EdgeTruncation | null) => void;
  onRetake: () => void;
  /** Absent where the sweep is not available: iOS, until its Swift is built. */
  onSweep?: () => void;
  onFilled: (reading: Recognised) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const degraded = quality?.level === 'degraded';
  const toSave = medicationFromReading(fields, truncation);
  const cut = (kind: 'name' | 'dosage' | 'instructions') =>
    isCutAtEdge(truncation, kind) ? (truncation?.diagnosed ? 'curve' : 'edge') : undefined;

  /**
   * The withheld fields with something specific to fill in.
   *
   * Only a field the reading found: filling in words cannot make the parser
   * find one it did not, so for a field never found the answer could only
   * come back "still incomplete". And only with a gap: without one, nothing
   * is identifiably missing, and an empty "type the directions" box would be
   * free text with nothing to check it by.
   */
  const fillable = lines
    ? FIELD_KINDS.filter((kind) => {
        const text = fields[kind]?.text;
        if (!text) return false;
        const withheld = isCutAtEdge(truncation, kind) || assessField(kind, text).level === 'damaged';
        return withheld && findGaps(lines, fields, kind).length > 0;
      })
    : [];
  const [filling, setFilling] = useState(false);

  /**
   * The curve, said once, with its own remedy. It replaces the degraded
   * read's "try somewhere brighter" rather than adding to it: that advice is
   * wrong here, and a user who follows it retakes the same failure.
   */
  const curvedNotice = truncation?.diagnosed ? (
    <Notice
      tone="warn"
      title={Strings.result.curved.title}
      body={truncation.side === 'right' ? Strings.result.curved.right : Strings.result.curved.left}
      live>
      {truncation.fields.length === 1 && truncation.fields[0] === 'instructions' ? (
        <BilingualText text={Strings.result.curved.restWhole} hideEnglish color={theme.warnText} />
      ) : null}
    </Notice>
  ) : null;
  // Only for the curve, where turning the bottle is the remedy: an edge cut on
  // a label not judged curved is told to retake, not to turn it.
  const sweepButton =
    truncation?.diagnosed && onSweep ? <BigButton label={Strings.sweep.start} onPress={onSweep} /> : null;

  // Local, so it starts closed on every new reading rather than inheriting
  // whatever the last one left.
  const [showFields, setShowFields] = useState(false);

  if (filling && lines) {
    return (
      <Sheet>
        <FillInPanel
          lines={lines}
          fields={fields}
          kinds={fillable}
          onConfirm={(reading) => {
            setFilling(false);
            onFilled(reading);
          }}
          onCancel={() => setFilling(false)}
        />
      </Sheet>
    );
  }

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
          cutAtEdge={cut('name')}
        />
        <CardDivider />
        <ReadingField
          label={Strings.result.dosage}
          kind="dosage"
          text={fields.dosage?.text}
          assess
          compact={degraded}
          cutAtEdge={cut('dosage')}
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
          cutAtEdge={cut('instructions')}
        />
      </Card>

      {fillable.length > 0 ? (
        <BigButton label={Strings.fillIn.start} onPress={() => setFilling(true)} tone="secondary" />
      ) : null}
    </>
  );

  // A sweep took no photograph, so there is none to say was deleted.
  const discardNotice = swept ? <SweepNotice /> : <DiscardNotice />;
  const filledNotice = filled ? (
    <Notice tone="info" title={Strings.fillIn.filledNote} />
  ) : stalled ? (
    // Said, so a screen that changed by itself mid-turn is not a mystery.
    <Notice tone="info" title={Strings.sweep.stalled} />
  ) : null;

  const saveBlock = !toSave ? (
    // No name, so nothing to match against the box; the reading cannot become a
    // record. It used to show no save button and no reason.
    <Notice tone="warn" title={Strings.failure.nameUnreadable} />
  ) : (
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
        onPress={() => onSave(fields, truncation)}
        tone={degraded ? 'secondary' : 'primary'}
      />
    </View>
  );

  if (degraded) {
    return (
      <Sheet>
        <Card>
          <View style={styles.headingRow}>
            <StatusBadge tone="warn" />
            <BilingualText
              text={Strings.result.degradedTitle}
              variant="heading"
              style={styles.headingText}
            />
          </View>
          {curvedNotice ?? <BilingualText text={Strings.result.degradedBody} hideEnglish />}
          {sweepButton}
          <BigButton
            label={Strings.camera.retake}
            onPress={onRetake}
            tone={sweepButton ? 'secondary' : 'primary'}
          />
        </Card>
        {filledNotice}

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
        {discardNotice}

        <RawLinesPanel lines={lines} />
        <CapturedFramePanel probe={devProbe} />
      </Sheet>
    );
  }

  return (
    <Sheet>
      <BilingualText text={Strings.result.title} variant="heading" />
      {curvedNotice}
      {sweepButton}
      {filledNotice}
      <Notice tone="info" title={Strings.result.compareWithBottle} />

      {fieldCards}

      {discardNotice}
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
/**
 * What a failed save says. It used to be the new-phone message — "saved on
 * another phone, scan your medicines again" — for every failure, which told
 * someone whose write had merely hiccuped that their whole list was gone.
 *
 * Only an unreadable vault gets the unreadable-vault message, worded for its
 * actual cause. Anything else is a save that did not happen, said plainly, with
 * a way back to what was about to be saved. No photo is mentioned: a barcode
 * save took none, and a reading's photo was deleted, and said so, earlier.
 */
function saveProblem(error: unknown, retry?: () => void): Phase {
  if (error instanceof VaultUnreadableError) {
    return {
      kind: 'problem',
      title: Strings.vault.unrecoverableTitle,
      message:
        error.reason === 'key-missing' ? Strings.vault.unrecoverableBody : Strings.failure.listDamagedBody,
      photoDiscarded: false,
    };
  }
  return {
    kind: 'problem',
    title: Strings.scan.saveFailedTitle,
    message: Strings.failure.addNotSaved,
    photoDiscarded: false,
    retry,
  };
}

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

function SweepNotice() {
  return (
    <View style={styles.notice}>
      <BilingualText text={Strings.sweep.nothingTaken} variant="label" />
    </View>
  );
}

const FIELD_KINDS = ['name', 'dosage', 'instructions'] as const;

function Sheet({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    // The page colour sits behind cards so that a white card reads as an
    // object; on plain white, cards and page merge and the grouping is lost.
    // Always scrollable, for the reason given in `Screen`.
    <SafeAreaView style={[styles.sheet, { backgroundColor: theme.page }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.sheetContent}>{children}</View>
      </ScrollView>
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
