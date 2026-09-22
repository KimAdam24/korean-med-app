import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/features/medications/use-profile';
import type { MedicationRecord } from '@/features/medications/types';
import { useTheme } from '@/hooks/use-theme';
import { Strings } from '@/i18n/strings';

/**
 * The medication profile (spec §3.3).
 *
 * Until this existed the profile was write-only: medicines could be saved and
 * never seen again, which made the app's central promise unreachable and left
 * the vault's read path unexercised outside of tests.
 */
export default function MedicationsScreen() {
  const router = useRouter();
  const { state, reload } = useProfile();

  /**
   * Re-read on every focus rather than once on mount. Coming back from adding,
   * editing or deleting must not show the list as it was before — a stale
   * medication list is the kind of wrong that looks right.
   */
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  if (state.status === 'loading') {
    return (
      <Sheet>
        <ActivityIndicator size="large" />
        <BilingualText text={Strings.medications.loading} align="center" />
      </Sheet>
    );
  }

  if (state.status === 'unrecoverable') {
    return (
      <Sheet>
        <BilingualText text={Strings.vault.unrecoverableTitle} variant="heading" />
        <BilingualText text={Strings.vault.unrecoverableBody} />
        {/*
          Deliberately not offering "start over" here. Erasing is destructive
          and lives behind settings, where the consequence is spelled out —
          putting it on the screen someone reaches while confused invites a tap
          that cannot be undone.
        */}
        <BigButton
          label={Strings.settings.open}
          tone="secondary"
          onPress={() => router.push('/settings')}
        />
      </Sheet>
    );
  }

  const { medications } = state.profile;

  if (medications.length === 0) {
    return (
      <Sheet>
        <BilingualText text={Strings.medications.emptyTitle} variant="heading" />
        <BilingualText text={Strings.medications.emptyBody} />
        <BigButton label={Strings.home.capture} onPress={() => router.push('/camera')} />
      </Sheet>
    );
  }

  return (
    <Sheet scroll>
      {medications.map((record) => (
        <MedicationRow
          key={record.id}
          record={record}
          onPress={() => router.push(`/medication/${record.id}`)}
        />
      ))}
      <BigButton
        label={Strings.home.capture}
        tone="secondary"
        onPress={() => router.push('/camera')}
      />
    </Sheet>
  );
}

function MedicationRow({
  record,
  onPress,
}: {
  record: MedicationRecord;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // The whole row is one target, and it announces as one thing: the name,
      // then whether it still needs checking. A screen reader walking four
      // separate labels per medicine is slower to use, not more informative.
      accessibilityLabel={
        record.needsReview
          ? `${record.name}. ${Strings.medications.unconfirmed.ko}`
          : record.name
      }
      style={({ pressed }) => [
        styles.row,
        // The same surface and contrast-checked edge as every other card, so
        // a medicine in the list looks like the medicine on its own page.
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      {/* The drug name is English and must not be paired with a translation. */}
      <BilingualText text={{ ko: record.name, en: '' }} variant="button" />

      {record.dosage ? <BilingualText text={{ ko: record.dosage, en: '' }} /> : null}

      {record.needsReview ? (
        <BilingualText text={Strings.medications.unconfirmed} variant="label" />
      ) : null}
    </Pressable>
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
  row: {
    // Padding rather than a fixed height: the row has to keep containing its
    // text when the system font size is turned up, which for this audience it
    // very often is.
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
    gap: Spacing.one,
    minHeight: 72,
    justifyContent: 'center',
  },
});
