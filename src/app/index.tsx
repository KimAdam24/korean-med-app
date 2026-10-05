import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card, CardDivider } from '@/components/card';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { IconSize, Spacing } from '@/constants/theme';
import { pickImage } from '@/features/capture/pick-image';
import { useProfile } from '@/features/medications/use-profile';
import { useAppLock } from '@/features/security/app-lock-context';
import { DevFileProbe } from '@/features/ocr/dev-file-probe';
import { ReminderStatus } from '@/features/reminders/reminder-status';
import { useTheme } from '@/hooks/use-theme';
import { Strings, type Bilingual } from '@/i18n/strings';

/**
 * Home: one thing to do, and two places to go.
 *
 * The capture action leads, inside a tinted card that explains it, because it
 * is the reason the app is opened. The other destinations sit below as one
 * grouped list, so they read as "elsewhere" rather than as three more buttons
 * competing with it for the same attention.
 */
export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { runWithSystemUi } = useAppLock();
  const { state, reload } = useProfile();

  // Re-read on focus, so the count is right after adding or removing one.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  /**
   * Chooses a photograph and hands it to the label reader, reusing the camera
   * screen's result view so both paths end in the same place.
   */
  const pickAndRead = useCallback(async () => {
    const picked = await pickImage(runWithSystemUi);
    if (!picked) return;
    router.push({ pathname: '/camera', params: { imageUri: picked.uri } });
  }, [router, runWithSystemUi]);

  const count = state.status === 'ready' ? state.profile.medications.length : 0;
  const countDetail: Bilingual | undefined =
    count > 0
      ? {
          ko: Strings.medications.countLabel.ko.replace('{n}', String(count)),
          en: Strings.medications.countLabel.en.replace('{n}', String(count)),
        }
      : undefined;

  return (
    <Screen>
      {/* Only when reminders are set and cannot work as set; otherwise nothing. */}
      <ReminderStatus attentionOnly />
      <Card variant="hero">
        <View style={[styles.heroIcon, { backgroundColor: theme.surface }]}>
          <Icon name="camera" color={theme.primaryIcon} size={IconSize.hero} />
        </View>
        <BilingualText text={Strings.home.captureHint} />
        <BigButton
          label={Strings.home.capture}
          icon="camera"
          onPress={() => router.push('/camera')}
        />
      </Card>

      <Card flush>
        <ListRow
          icon="medicines"
          title={Strings.medications.open}
          detail={countDetail}
          onPress={() => router.push('/medications')}
        />
        <CardDivider inset />

        {/*
          The gallery: how a caregiver adds bottles. The privacy line below was
          rewritten for it (`privacy.*`, reviewed 2026-10-04): the old one
          promised that photos are deleted after reading, which is untrue of a
          photo the user already owns, and it could not ship beside this.
        */}
        <ListRow icon="photo" title={Strings.privacy.choosePhoto} onPress={pickAndRead} />
        <CardDivider inset />

        <ListRow
          icon="settings"
          title={Strings.settings.open}
          onPress={() => router.push('/settings')}
        />
      </Card>

      <View style={styles.privacy}>
        <Icon name="lock" color={theme.textSecondary} />
        <BilingualText
          text={Strings.privacy.home}
          variant="label"
          color={theme.textSecondary}
          style={styles.privacyText}
        />
      </View>

      <DevFileProbe />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.one,
    paddingTop: Spacing.two,
  },
  privacyText: {
    flex: 1,
  },
});
