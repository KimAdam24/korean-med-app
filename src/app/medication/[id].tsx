import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card, CardDivider } from '@/components/card';
import { Notice } from '@/components/notice';
import { ReadingField } from '@/components/reading-field';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  confirmMedication,
  removeMedication,
  updateMedication,
} from '@/features/medications/medication-store';
import { useProfile } from '@/features/medications/use-profile';
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
  | { kind: 'viewing' }
  | { kind: 'editing'; name: string; dosage: string; instructions: string; error?: Bilingual }
  | { kind: 'confirming-removal' }
  | { kind: 'working' };

export default function MedicationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, reload } = useProfile();
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

    setMode({ kind: 'working' });
    await updateMedication(record.id, {
      name,
      // Cleared fields become absent rather than empty strings, so
      // `needsConfirmation` keeps treating them as unfilled.
      dosage: mode.dosage.trim() || undefined,
      instructions: mode.instructions.trim() || undefined,
      /**
       * Editing is the user telling us what the label says, which is a
       * stronger source than the reading it replaces. Nothing left to check.
       */
      needsReview: false,
    });
    await reload();
    setMode({ kind: 'viewing' });
  }, [mode, record, reload]);

  const confirm = useCallback(async () => {
    if (!record) return;
    setMode({ kind: 'working' });
    await confirmMedication(record.id);
    await reload();
    setMode({ kind: 'viewing' });
  }, [record, reload]);

  const remove = useCallback(async () => {
    if (!record) return;
    setMode({ kind: 'working' });
    await removeMedication(record.id);
    router.back();
  }, [record, router]);

  if (state.status === 'loading' || mode.kind === 'working') {
    return (
      <Sheet>
        <ActivityIndicator size="large" />
      </Sheet>
    );
  }

  if (state.status === 'unrecoverable' || !record) {
    return (
      <Sheet>
        <BilingualText text={Strings.vault.unrecoverableTitle} variant="heading" />
        <BigButton label={Strings.camera.close} onPress={() => router.back()} />
      </Sheet>
    );
  }

  if (mode.kind === 'confirming-removal') {
    return (
      <Sheet>
        <BilingualText text={Strings.medications.removeConfirmTitle} variant="heading" />
        <BilingualText text={Strings.medications.removeConfirmBody} />
        {/*
          The destructive option is second and the way out is first. On a list
          the user scrolls with imprecise taps, the ordering is the safeguard.
        */}
        <BigButton label={Strings.medications.cancel} onPress={() => setMode({ kind: 'viewing' })} />
        <BigButton
          label={Strings.medications.removeConfirmYes}
          tone="secondary"
          onPress={remove}
        />
      </Sheet>
    );
  }

  if (mode.kind === 'editing') {
    return (
      <Sheet scroll>
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

        {mode.error ? <BilingualText text={mode.error} variant="label" /> : null}

        <BigButton label={Strings.medications.save} onPress={save} />
        <BigButton
          label={Strings.medications.cancel}
          tone="secondary"
          onPress={() => setMode({ kind: 'viewing' })}
        />
      </Sheet>
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
    <Sheet scroll>
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
        onPress={startEditing}
        tone={damaged ? 'primary' : 'secondary'}
      />
      <BigButton
        label={Strings.medications.remove}
        tone="secondary"
        onPress={() => setMode({ kind: 'confirming-removal' })}
      />
    </Sheet>
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
          { color: theme.text, borderColor: theme.textSecondary },
          multiline && styles.inputMultiline,
        ]}
      />
    </View>
  );
}

function Sheet({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  const content = <View style={styles.content}>{children}</View>;
  return (
    <ThemedView type="page" style={styles.root}>
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
  field: {
    gap: Spacing.one,
  },
  meta: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  input: {
    fontSize: 22,
    lineHeight: 32,
    borderWidth: 2,
    borderRadius: Spacing.three,
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
