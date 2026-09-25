import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card, CardDivider } from '@/components/card';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { IconSize, Radius, Spacing } from '@/constants/theme';
import { ProfileProblem } from '@/features/medications/profile-problem';
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
  const theme = useTheme();
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
      <Screen centered>
        <ActivityIndicator size="large" color={theme.primaryIcon} />
        <BilingualText text={Strings.medications.loading} align="center" />
      </Screen>
    );
  }

  if (state.status === 'unrecoverable' || state.status === 'unavailable') {
    return <ProfileProblem state={state} onRetry={reload} />;
  }

  const { medications } = state.profile;

  if (medications.length === 0) {
    return (
      <Screen centered>
        <View style={[styles.emptyIcon, { backgroundColor: theme.primaryWash }]}>
          <Icon name="medicines" color={theme.primaryIcon} size={IconSize.hero} />
        </View>
        <BilingualText text={Strings.medications.emptyTitle} variant="heading" align="center" />
        <BilingualText text={Strings.medications.emptyBody} align="center" />
        <BigButton
          label={Strings.home.capture}
          icon="camera"
          onPress={() => router.push('/camera')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Card flush>
        {medications.map((record, index) => (
          <Fragment key={record.id}>
            {index > 0 ? <CardDivider inset /> : null}
            <MedicationRow
              record={record}
              onPress={() => router.push(`/medication/${record.id}`)}
            />
          </Fragment>
        ))}
      </Card>

      <BigButton
        label={Strings.home.capture}
        icon="camera"
        tone="secondary"
        onPress={() => router.push('/camera')}
      />
    </Screen>
  );
}

function MedicationRow({ record, onPress }: { record: MedicationRecord; onPress: () => void }) {
  const theme = useTheme();

  return (
    <ListRow
      icon="medicines"
      // The drug name is English and must not be paired with a translation.
      title={{ ko: record.name, en: '' }}
      detail={record.dosage ? { ko: record.dosage, en: '' } : undefined}
      onPress={onPress}
      // The whole row is one target, and it announces as one thing: the name,
      // then whether it still needs checking. A screen reader walking four
      // separate labels per medicine is slower to use, not more informative.
      accessibilityLabel={
        record.needsReview ? `${record.name}. ${Strings.medications.unconfirmed.ko}` : record.name
      }>
      {record.needsReview ? (
        // A badge rather than a line of text, so "needs checking" reads as
        // a state of this medicine and not as part of its name or dose.
        <View style={[styles.badge, { backgroundColor: theme.warnSurface }]}>
          <View style={[styles.badgeDot, { backgroundColor: theme.warnAccent }]} />
          <BilingualText
            text={Strings.medications.unconfirmed}
            variant="label"
            color={theme.warnText}
            hideEnglish
          />
        </View>
      ) : null}
    </ListRow>
  );
}

const styles = StyleSheet.create({
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + Spacing.one,
    borderRadius: Radius.pill,
    marginTop: Spacing.one,
  },
  badgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
