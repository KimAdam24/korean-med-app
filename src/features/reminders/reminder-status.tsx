import { ActivityIndicator, Linking, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Notice } from '@/components/notice';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate } from '@/i18n/strings';

import { formatReminderTime } from './plan';
import { useReminders } from './reminders-context';
import { needsAttention, openExactAlarmSettings, requestReminderPermission } from './scheduler';
import { timeWords } from './time-picker';

/**
 * What the reminders are actually doing, and the one thing that fixes them
 * when they are not working.
 *
 * "On" is said plainly, with the next time the phone itself will ring. Every
 * other state is a warning with its remedy beside it, and is announced: a
 * reminder that will not sound is the thing the user most needs to know and
 * is least likely to notice, because nothing happens.
 *
 * `attentionOnly` shows nothing unless something is wrong — for the home
 * screen, which should not narrate reminders that are fine.
 */
export function ReminderStatus({ attentionOnly = false }: { attentionOnly?: boolean }) {
  const theme = useTheme();
  const { health, resync } = useReminders();

  if (attentionOnly && !needsAttention(health)) return null;

  if (health === null) {
    return (
      <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
        <ActivityIndicator color={theme.primaryIcon} />
        <BilingualText text={Strings.reminders.statusChecking} variant="label" />
      </View>
    );
  }

  switch (health.kind) {
    case 'none':
      return null;
    case 'on':
      return (
        <BilingualText
          variant="label"
          color={theme.textSecondary}
          text={
            health.next
              ? fillTemplate(Strings.reminders.statusOn, {
                  time: formatReminderTime(
                    { hour: health.next.getHours(), minute: health.next.getMinutes() },
                    timeWords()
                  ),
                })
              : Strings.reminders.statusOnNoNext
          }
        />
      );
    case 'late':
      return (
        <Notice tone="warn" title={attentionOnly ? Strings.reminders.homeWarning : Strings.reminders.statusLate} body={attentionOnly ? Strings.reminders.statusLate : undefined} live>
          <BigButton
            label={Strings.reminders.openAlarmSettings}
            tone="secondary"
            // The change takes effect when the user comes back, which re-syncs.
            onPress={() => {
              if (!openExactAlarmSettings()) void Linking.openSettings().catch(() => undefined);
            }}
          />
        </Notice>
      );
    case 'blocked':
      return (
        <Notice tone="warn" title={attentionOnly ? Strings.reminders.homeWarning : Strings.reminders.statusBlocked} body={attentionOnly ? Strings.reminders.statusBlocked : undefined} live>
          {health.canAsk ? (
            <BigButton
              label={Strings.reminders.allow}
              tone="secondary"
              onPress={async () => {
                await requestReminderPermission().catch(() => false);
                await resync();
              }}
            />
          ) : (
            <BigButton
              label={Strings.permission.openSettings}
              tone="secondary"
              onPress={() => void Linking.openSettings().catch(() => undefined)}
            />
          )}
        </Notice>
      );
    case 'unverified':
      return (
        <Notice tone="warn" title={attentionOnly ? Strings.reminders.homeWarning : Strings.reminders.statusUnverified} body={attentionOnly ? Strings.reminders.statusUnverified : undefined} live>
          <BigButton label={Strings.scan.retry} tone="secondary" onPress={() => void resync()} />
        </Notice>
      );
  }
}
