import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { DevFileProbe } from '@/features/ocr/dev-file-probe';
import { Strings } from '@/i18n/strings';

export default function HomeScreen() {
  const router = useRouter();

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
