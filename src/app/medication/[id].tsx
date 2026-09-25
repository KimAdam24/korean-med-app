import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { ProfileProblem } from '@/features/medications/profile-problem';
import { useProfile } from '@/features/medications/use-profile';
import { ReminderSection } from '@/features/reminders/reminder-section';
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
    setMode({ kind: 'working' });
    try {
      await updateMedication(record.id, {
        name,
        // Cleared fields become absent rather than empty strings, so
        // `needsConfirmation` keeps treating them as unfilled.
        dosage: editing.dosage.trim() || undefined,
        instructions: editing.instructions.trim() || undefined,
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
  const damaged = (
    [
      ['name', record.name],
      ['dosage', record.dosage],
      ['instructions', record.instructions],
    ] as const
  ).some(([kind, text]) => assess && text && assessField(kind, text).level === 'damaged');

  return (
    <Screen>
      {mode.kind === 'viewing' && mode.notice ? <Notice tone="warn" title={mode.notice} live /> : null}
      <Card>
        <ReadingField
          label={Strings.medications.fieldName}
          kind="name"
          text={record.name}
          assess={assess}
          prominent
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
        />
      </Card>

      <ReminderSection record={record} profile={state.profile} onChanged={reload} />

      <View style={styles.meta}>
        <BilingualText text={Strings.medications.source} variant="label" />
        <BilingualText
          text={
            record.source === 'label-scan'
              ? Strings.medications.sourceScan
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
