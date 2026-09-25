import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Screen } from '@/components/screen';
import { useTheme } from '@/hooks/use-theme';
import { Strings } from '@/i18n/strings';

import type { ProfileState } from './use-profile';

type Problem = Extract<ProfileState, { status: 'unrecoverable' | 'unavailable' }>;

/**
 * What a screen that shows medicines says when it cannot show them.
 *
 * Three different situations, which used to share one message — the one for a
 * restore onto a new phone, "scan your medicines again" — including for a read
 * that merely failed for a moment:
 *
 * - `unavailable`: the read failed, the data is fine. Try again.
 * - `unrecoverable`, `key-missing`: the key did not come with the data; almost
 *   always a new phone. The data is gone for good.
 * - `unrecoverable`, `undecryptable`: the key is here and the data does not
 *   open with it — damage, on this phone. Also gone for good, but saying "new
 *   phone" to someone holding the same phone is confusing at the worst moment.
 *
 * Erasing is deliberately not offered here: it lives behind Settings, where
 * its cost is spelled out, and someone who reached this screen confused should
 * not be one tap from a step that cannot be undone.
 */
export function ProfileProblem({ state, onRetry }: { state: Problem; onRetry: () => Promise<void> }) {
  const router = useRouter();
  const theme = useTheme();
  const [retrying, setRetrying] = useState(false);

  if (state.status === 'unavailable') {
    return (
      <Screen centered>
        <BilingualText text={Strings.failure.listUnavailableTitle} variant="heading" />
        <BilingualText text={Strings.failure.listUnavailableBody} />
        {retrying ? (
          <ActivityIndicator size="large" color={theme.primaryIcon} />
        ) : (
          <BigButton
            label={Strings.scan.retry}
            onPress={async () => {
              setRetrying(true);
              try {
                await onRetry();
              } finally {
                setRetrying(false);
              }
            }}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen centered>
      <BilingualText text={Strings.vault.unrecoverableTitle} variant="heading" />
      <BilingualText
        text={
          state.reason === 'key-missing'
            ? Strings.vault.unrecoverableBody
            : Strings.failure.listDamagedBody
        }
      />
      <BigButton
        label={Strings.settings.open}
        icon="settings"
        tone="secondary"
        onPress={() => router.push('/settings')}
      />
    </Screen>
  );
}
