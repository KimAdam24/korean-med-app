import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { pickImage } from '@/features/capture/pick-image';
import { useAppLock } from '@/features/security/app-lock-context';
import { DevFileProbe } from '@/features/ocr/dev-file-probe';
import { Strings } from '@/i18n/strings';

export default function HomeScreen() {
  const router = useRouter();
  const { runWithSystemUi } = useAppLock();

  /**
   * Chooses a photograph and hands it to the label reader, reusing the camera
   * screen's result view so both paths end in the same place.
   */
  const pickAndRead = useCallback(async () => {
    const picked = await pickImage(runWithSystemUi);
    if (!picked) return;
    router.push({ pathname: '/camera', params: { imageUri: picked.uri } });
  }, [router, runWithSystemUi]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/**
         * Scrolls only because the development probe below can produce more
         * output than fits. The real screen is three elements tall, and for the
         * target user it must not scroll at all — which it does not, since the
         * probe renders nothing outside `__DEV__`.
         */}
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.intro}>
            <BilingualText text={Strings.home.captureHint} />
          </View>

          <BigButton
            label={Strings.home.capture}
            onPress={() => router.push('/camera')}
            style={styles.cta}
          />

          {/*
            The gallery path, gated until the privacy copy is reviewed.

            The feature itself is finished. What is not finished is the copy:
            the home screen still promises that photos are deleted after
            reading, which is true of the camera and false of a photo the user
            already owns. Shipping the button beside that sentence would make
            the app state something untrue about the user's own files, so the
            gate stays until `content-drafts/privacy-copy.draft.md` is signed
            off — at which point removing it is the last step of that review.
          */}
          {__DEV__ ? (
            <BigButton
              label={{ ko: '사진 고르기 (검토 대기)', en: 'Choose a photo (pending copy review)' }}
              tone="secondary"
              onPress={pickAndRead}
              style={styles.cta}
            />
          ) : null}

          <BigButton
            label={Strings.medications.open}
            tone="secondary"
            onPress={() => router.push('/medications')}
            style={styles.cta}
          />

          <BigButton
            label={Strings.settings.open}
            tone="secondary"
            onPress={() => router.push('/settings')}
            style={styles.cta}
          />

          <View style={styles.privacy}>
            <BilingualText text={Strings.home.privacy} variant="label" />
          </View>

          <DevFileProbe />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
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
    padding: Spacing.four,
    gap: Spacing.four,
  },
  intro: {
    flex: 1,
    justifyContent: 'center',
  },
  cta: {
    alignSelf: 'stretch',
  },
  privacy: {
    paddingBottom: Spacing.three,
  },
});
