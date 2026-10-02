import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card, CardDivider } from '@/components/card';
import { Notice } from '@/components/notice';
import { ReadingField } from '@/components/reading-field';
import { Screen } from '@/components/screen';
import { Radius, Spacing, Type } from '@/constants/theme';
import {
  confirmMedication,
  removeMedication,
  updateMedication,
} from '@/features/medications/medication-store';
import { koreanDirections } from '@/features/directions/korean-directions';
import { doseFormOf } from '@/features/drugs/approved-uses';
import { ApprovedUsesCard, type UsesSource } from '@/features/drugs/approved-uses-card';
import { koreanIngredientNames } from '@/features/drugs/korean-names';
import { fetchIngredients } from '@/features/drugs/rxnorm';
import { ProfileProblem } from '@/features/medications/profile-problem';
import { useProfile } from '@/features/medications/use-profile';
import { ReminderSection } from '@/features/reminders/reminder-section';
import { Scope } from '@/features/scope';
import { useReminders } from '@/features/reminders/reminders-context';
import { goBackOr } from '@/features/navigation/go-back';
import { assessField } from '@/features/ocr/field-integrity';
import { useTheme } from '@/hooks/use-theme';
import { Strings, type Bilingual } from '@/i18n/strings';

/**
 * One medicine: what was read, and the means to correct it (spec §3.3, §5).
 *
 * Correction is the point rather than a convenience. Every field the label
 * reader produces is marked "needs checking", and until this screen existed
 * that flag was a dead end — the app could tell a user its reading might be
 * wrong, and offer them no way to put it right. A warning with no remedy
 * teaches people to ignore warnings.
 */
type Mode =
  /** `notice` says what just failed, when something did. */
  | { kind: 'viewing'; notice?: Bilingual }
  | { kind: 'editing'; name: string; dosage: string; instructions: string; error?: Bilingual }
  | { kind: 'confirming-removal' }
  | { kind: 'working' };

export default function MedicationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { state, reload } = useProfile();
  const { resync } = useReminders();
  const [mode, setMode] = useState<Mode>({ kind: 'viewing' });

  const record = useMemo(
    () =>
      state.status === 'ready'
        ? state.profile.medications.find((entry) => entry.id === id)
        : undefined,
    [state, id]
  );

  /**
   * A medicine identified by its barcode while offline was saved without its
   * ingredients: the lookup failed, and nothing asked again, so it never got
   * its Korean name (§3.2), nor what an interaction check needs. Asked once
   * per visit, quietly, for the same product code RxNav was sent when the
   * barcode was scanned; if it fails again, nothing changes. Written only
   * while this screen is open, so an answer arriving after the medicine was
   * removed, or everything erased, cannot put it back.
   */
  const mounted = useRef(true);
  useEffect(() => {
    // Set here as well as initially: Fast Refresh runs the cleanup and then
    // this again, and the screen is still open.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const askedIngredients = useRef<string | null>(null);
  useEffect(() => {
    // Only while a feature that uses the ingredients is offered (`Scope`).
    if (!Scope.koreanDrugNames) return;
    const identity = record?.identity;
    if (!record || !identity || (identity.ingredients?.length ?? 0) > 0) return;
    if (askedIngredients.current === record.id) return;
    askedIngredients.current = record.id;
    void (async () => {
      const ingredients = await fetchIngredients(identity.rxcui);
      if (!mounted.current || ingredients.length === 0) return;
      try {
        await updateMedication(record.id, { identity: { ...identity, ingredients } });
        if (mounted.current) await reload();
      } catch {
        // As it was; asked again on the next visit.
      }
    })();
  }, [record, reload]);

  const startEditing = useCallback(() => {
    if (!record) return;
    setMode({
      kind: 'editing',
      name: record.name,
      dosage: record.dosage ?? '',
      instructions: record.instructions ?? '',
    });
  }, [record]);

  const save = useCallback(async () => {
    if (mode.kind !== 'editing' || !record) return;

    const name = mode.name.trim();
    if (name.length === 0) {
      // A medicine with no name cannot be matched against a box, which is the
      // one thing the user does with this field.
      setMode({ ...mode, error: Strings.medications.nameRequired });
      return;
    }

    const editing = mode;
    const dosage = editing.dosage.trim() || undefined;
    const instructions = editing.instructions.trim() || undefined;
    setMode({ kind: 'working' });
    try {
      await updateMedication(record.id, {
        name,
        // A match for the old name is not one for the new: its page asks again.
        // And the new name is the user's, typed, not the label's, read.
        ...(name !== record.name
          ? { nameMatch: undefined, nameSource: 'typed' as const }
          : record.nameMatch && (dosage !== record.dosage || instructions !== record.instructions)
            ? // The form its reading named is the user's to say now: what they
              // wrote decides it ("Take 1 tablet", "1 drop in each eye").
              {
                nameMatch: {
                  rxcui: record.nameMatch.rxcui,
                  ingredients: record.nameMatch.ingredients,
                  matched: record.nameMatch.matched,
                },
              }
            : {}),
        // Saved from this form, with the cut-off warning under it, the name is
        // the user's word, changed or not, and no longer a withheld reading.
        nameIncomplete: undefined,
        // Cleared fields become absent rather than empty strings, so
        // `needsConfirmation` keeps treating them as unfilled.
        dosage,
        instructions,
      /**
       * Editing is the user telling us what the label says, which is a
       * stronger source than the reading it replaces. Nothing left to check.
       */
        needsReview: false,
      });
      await reload();
      setMode({ kind: 'viewing' });
    } catch {
      // Back to the form with what was typed — and, now, saying why. It used to
      // return to the form silently, which looked exactly like a save that had
      // not been attempted; the back button then discarded the edit.
      setMode({ ...editing, error: Strings.failure.editNotSaved });
    }
  }, [mode, record, reload]);

  const confirm = useCallback(async () => {
    if (!record) return;
    setMode({ kind: 'working' });
    try {
      await confirmMedication(record.id);
      await reload();
      setMode({ kind: 'viewing' });
    } catch {
      // Still unconfirmed, and the notice beside it says so; this says why the
      // tap did not take.
      setMode({ kind: 'viewing', notice: Strings.failure.confirmNotSaved });
    }
  }, [record, reload]);

  const remove = useCallback(async () => {
    if (!record) return;
    setMode({ kind: 'working' });
    try {
      await removeMedication(record.id);
      // Its reminders go with it; a reminder left for a medicine that is no
      // longer on the list would still ring.
      void resync();
      goBackOr(router, '/medications');
    } catch {
      // Still in the list, and now said so: returning to the medicine's page in
      // silence after "yes, remove it" read as though it had gone.
      setMode({ kind: 'viewing', notice: Strings.failure.removeFailed });
    }
  }, [record, router, resync]);

  if (state.status === 'loading' || mode.kind === 'working') {
    return (
      <Screen centered>
        <ActivityIndicator size="large" color={theme.primaryIcon} />
      </Screen>
    );
  }

  if (state.status === 'unrecoverable' || state.status === 'unavailable') {
    return <ProfileProblem state={state} onRetry={reload} />;
  }

  if (!record) {
    // Removed elsewhere, or a stale link. Not a problem with the list, which
    // the old "cannot be opened" message here implied.
    return (
      <Screen centered>
        <BilingualText text={Strings.failure.medicineGone} variant="heading" autoFocus />
        <BigButton label={Strings.camera.close} onPress={() => goBackOr(router, '/medications')} />
      </Screen>
    );
  }

  if (mode.kind === 'confirming-removal') {
    return (
      <Screen centered>
        <BilingualText text={Strings.medications.removeConfirmTitle} variant="heading" autoFocus />
        <BilingualText text={Strings.medications.removeConfirmBody} />
        {/*
          The destructive option is second and the way out is first. On a list
          the user scrolls with imprecise taps, the ordering is the safeguard.
        */}
        <BigButton label={Strings.medications.cancel} onPress={() => setMode({ kind: 'viewing' })} />
        <BigButton
          label={Strings.medications.removeConfirmYes}
          icon="erase"
          tone="caution"
          onPress={remove}
        />
      </Screen>
    );
  }

  if (mode.kind === 'editing') {
    return (
      <Screen>
        <Field
          label={Strings.medications.fieldName}
          value={mode.name}
          placeholder={Strings.medications.fieldNamePlaceholder.ko}
          onChange={(name) => setMode({ ...mode, name, error: undefined })}
        />
        {/*
          Said here too, beside the name itself: saving this form is taken as
          the user's word for the name (see `save`), so they should see that
          the camera may have missed part of it before they give it.
        */}
        {record?.nameIncomplete ? <Notice tone="warn" title={Strings.result.curved.edgeNote} /> : null}
        <Field
          label={Strings.medications.fieldDosage}
          value={mode.dosage}
          onChange={(dosage) => setMode({ ...mode, dosage })}
        />
        <Field
          label={Strings.medications.fieldInstructions}
          value={mode.instructions}
          multiline
          onChange={(instructions) => setMode({ ...mode, instructions })}
        />

        {mode.error ? <Notice tone="warn" title={mode.error} live /> : null}

        <BigButton label={Strings.medications.save} onPress={save} />
        <BigButton
          label={Strings.medications.cancel}
          tone="secondary"
          onPress={() => setMode({ kind: 'viewing' })}
        />
      </Screen>
    );
  }

  /**
   * Machine readings are judged for damage until the user takes ownership of
   * them by confirming or editing. After that the text is theirs, and flagging
   * a typo in the user's own words as a misread would be wrong.
   *
   * Applied here as well as at save time because records saved before the
   * check existed may still carry damaged directions, and this is the screen
   * that would otherwise present them as instructions.
   */
  const assess = record.needsReview;
  // A name typed from the bottle on the result screen is the user's already,
  // though the rest of the reading is still to check: not judged as a misread.
  const assessName = assess && record.nameSource !== 'typed';
  // A name its reading found cut off at the label's edge counts as damaged
  // however whole it reads: the rest of it is on the bottle, not here.
  const nameCut = record.nameIncomplete === true;
  const damaged =
    nameCut ||
    (
      [
        ['name', record.name, assessName],
        ['dosage', record.dosage, assess],
        ['instructions', record.instructions, assess],
      ] as const
    ).some(([kind, text, judged]) => judged && text && assessField(kind, text).level === 'damaged');

  // §3.2: Korean only from approved sources, and null until they arrive: the
  // ingredients in 식약처's names (a barcode record's, all or none), and the
  // directions built from reviewed phrases (all of them, or none).
  const koreanName = Scope.koreanDrugNames
    ? (koreanIngredientNames(record.identity?.ingredients)?.join(' + ') ?? null)
    : null;
  const koreanHow = record.instructions ? koreanDirections(record.instructions) : null;

  // A barcode's product exactly; otherwise the medicine its name names, by
  // the match made when it was saved, or made now for an older record. A
  // name that reads as damaged is not matched at all, nor one its reading
  // withheld as cut off until the user has saved it from the edit form. A
  // typed one is matched as typed: word for word, so a slip matches nothing.
  const nameWithheld =
    nameCut || (record.nameSource !== 'typed' && assessField('name', record.name).level === 'damaged');
  const usesSource: UsesSource = record.identity
    ? { kind: 'product', ndc11: record.identity.ndc11, rxcui: record.identity.rxcui }
    : {
        kind: 'name',
        name: nameWithheld ? null : record.name,
        ...(record.nameSource === 'typed' ? { typed: true } : {}),
        // The form that chose the reading's label, where it was saved with it.
        // A match saved before the form was kept with it has none, nor one
        // whose strength or directions the user has rewritten: the record's
        // own name, strength and directions decide.
        form:
          record.nameMatch?.form !== undefined
            ? record.nameMatch.form
            : doseFormOf(record.name, record.dosage, record.instructions),
        ...(record.nameMatch ? { known: record.nameMatch } : {}),
      };

  return (
    <Screen>
      {mode.kind === 'viewing' && mode.notice ? <Notice tone="warn" title={mode.notice} live /> : null}
      <Card>
        <ReadingField
          label={Strings.medications.fieldName}
          kind="name"
          text={record.name}
          assess={assessName}
          cutAtEdge={nameCut ? 'edge' : undefined}
          prominent
          korean={koreanName ? { text: koreanName, source: Strings.guidance.perMfds } : undefined}
        />
        <CardDivider />
        <ReadingField
          label={Strings.medications.fieldDosage}
          kind="dosage"
          text={record.dosage}
          assess={assess}
        />
      </Card>

      <Card>
        <ReadingField
          label={Strings.medications.fieldInstructions}
          kind="instructions"
          text={record.instructions}
          assess={assess}
          korean={koreanHow ? { text: koreanHow.ko, source: Strings.guidance.perReviewedPhrases } : undefined}
        />
      </Card>

      <ApprovedUsesCard source={usesSource} />

      <ReminderSection record={record} profile={state.profile} onChanged={reload} />

      <View style={styles.meta}>
        <BilingualText text={Strings.medications.source} variant="label" />
        <BilingualText
          text={
            // A barcode identifies the product; a photo's reading does not.
            record.identity
              ? Strings.medications.sourceScan
              : record.source === 'label-scan'
                ? Strings.medications.sourcePhoto
                : Strings.medications.sourceManual
          }
        />
      </View>

      {record.needsReview && !damaged ? (
        <>
          <Notice tone="info" title={Strings.medications.unconfirmed} />
          <BigButton label={Strings.medications.confirm} onPress={confirm} />
        </>
      ) : null}

      {/*
        With damage present, "yes, I checked it" is not offered: confirming
        would mark the broken text as the user's own and remove the warning.
        Editing is the way forward, so it becomes the primary action.
      */}
      <BigButton
        label={Strings.medications.edit}
        icon="edit"
        onPress={startEditing}
        tone={damaged ? 'primary' : 'secondary'}
      />
      <BigButton
        label={Strings.medications.remove}
        icon="erase"
        tone="caution"
        onPress={() => setMode({ kind: 'confirming-removal' })}
      />
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: Bilingual;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <BilingualText text={label} variant="label" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        accessibilityLabel={label.ko}
        // Sized like the rest of the app rather than the platform default,
        // which is set for a general audience and is too small here.
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.textSecondary, backgroundColor: theme.surface },
          multiline && styles.inputMultiline,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  meta: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  input: {
    fontSize: Type.body.fontSize,
    lineHeight: Type.body.lineHeight,
    borderWidth: 2,
    borderRadius: Radius.inner,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    // Vertical padding rather than a height, so the box grows with the system
    // font size instead of clipping the text inside it.
    paddingVertical: Spacing.three,
  },
  inputMultiline: {
    minHeight: 140,
    textAlignVertical: 'top',
  },
});
