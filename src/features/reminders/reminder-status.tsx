import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Notice } from '@/components/notice';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate } from '@/i18n/strings';

import { formatReminderTime } from './plan';
import { useReminders } from './reminders-context';
import {
  needsAttention,
  openExactAlarmSettings,
  openReminderChannelSettings,
  requestReminderPermission,
} from './scheduler';
import { timeWords } from './time-picker';

/**
 * What the reminders are actually doing, and the one thing that fixes them
 * when they are not working.
 *
 * "On" is said plainly, with the next time the phone itself will ring, and
 * only when nothing the phone reports can stop them. Every other state is a
 * warning with its remedy beside it, and is announced: a reminder that will
 * not sound is the thing the user most needs to know and is least likely to
 * notice, because nothing happens.
 *
 * Do Not Disturb is the case the phone half reports: whether it is on now,
 * and whether the reminders may pass it, but never when it will next be on.
 * So where they may not pass, they are "set", not "on", with what would
 * silence them; and on Android, the way to let them through, explained before
 * the phone's settings open.
 *
 * `attentionOnly` shows nothing unless something is wrong — for the home
 * screen, which should not narrate reminders that are fine.
 */
export function ReminderStatus({ attentionOnly = false }: { attentionOnly?: boolean }) {
  const theme = useTheme();
  const { health, resync } = useReminders();
  const [explaining, setExplaining] = useState(false);

  if (attentionOnly && !needsAttention(health)) return null;

  if (health === null) {
    return (
      <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
        <ActivityIndicator color={theme.primaryIcon} />
        <BilingualText text={Strings.reminders.statusChecking} variant="label" />
      </View>
    );
  }

  const nextLine = (on: boolean) => {
    if (health.kind !== 'on' && health.kind !== 'dnd') return null;
    return (
      <BilingualText
        variant="label"
        color={theme.textSecondary}
        text={
          health.next
            ? fillTemplate(on ? Strings.reminders.statusOn : Strings.reminders.statusSet, {
                time: formatReminderTime(
                  { hour: health.next.getHours(), minute: health.next.getMinutes() },
                  timeWords()
                ),
              })
            : on
              ? Strings.reminders.statusOnNoNext
              : Strings.reminders.statusSetNoNext
        }
      />
    );
  };

  switch (health.kind) {
    case 'none':
      return null;
    case 'dnd': {
      const warning = health.now
        ? Strings.reminders.statusDndNow
        : Platform.OS === 'ios'
          ? Strings.reminders.statusFocus
          : Strings.reminders.statusDnd;
      const letThrough = health.letThrough ? (
        explaining ? (
          <>
            <BilingualText text={Strings.reminders.letThroughExplain} autoFocus />
            <BigButton
              label={Strings.reminders.askContinue}
              onPress={() => {
                setExplaining(false);
                // Read back when the user comes back to the app, which re-syncs.
                if (!openReminderChannelSettings()) void Linking.openSettings().catch(() => undefined);
              }}
            />
            <BigButton label={Strings.onboarding.notNow} tone="secondary" onPress={() => setExplaining(false)} />
          </>
        ) : (
          <BigButton label={Strings.reminders.letThroughDnd} tone="secondary" onPress={() => setExplaining(true)} />
        )
      ) : null;
      if (attentionOnly) {
        return (
          <Notice tone="warn" title={Strings.reminders.homeWarning} body={warning} live>
            {letThrough}
          </Notice>
        );
      }
      return (
        <View style={{ gap: Spacing.two }}>
          {nextLine(false)}
          {/* Amber, as anything that is not what it looks like: set is not sure to sound. */}
          <Notice tone="warn" title={warning} live>
            {letThrough}
          </Notice>
        </View>
      );
    }
    case 'on':
      return nextLine(true);
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
    case 'silent':
      // Only the phone's settings can turn the sound back on; the app cannot.
      return (
        <Notice tone="warn" title={attentionOnly ? Strings.reminders.homeWarning : Strings.reminders.statusSilent} body={attentionOnly ? Strings.reminders.statusSilent : undefined} live>
          <BigButton
            label={Strings.permission.openSettings}
            tone="secondary"
            onPress={() => void Linking.openSettings().catch(() => undefined)}
          />
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
