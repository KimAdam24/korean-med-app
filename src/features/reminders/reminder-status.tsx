import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Notice } from '@/components/notice';
import { Spacing } from '@/constants/theme';
import { setDndWarningSeen } from '@/features/preferences/preferences';
import { usePreferences } from '@/features/preferences/preferences-context';
import { useAppLock } from '@/features/security/app-lock-context';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate } from '@/i18n/strings';

import { useReminders } from './reminders-context';
import {
  needsAttention,
  openExactAlarmSettings,
  openReminderChannelSettings,
  requestReminderPermission,
} from './scheduler';
import { timeInBoth } from './time-picker';

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
 * Until it is dismissed (확인), or they are let through. A warning that is
 * always there stops being read. Dismissed, the times still say "set", not
 * "on", which stays true; and while Do Not Disturb is on now, the warning is
 * back whatever was dismissed, since then they will not sound. Dismissing is
 * phone-wide, as Do Not Disturb is, and is forgotten once the reminders are
 * seen to pass it: if they stop passing, that is new (`RemindersProvider`).
 *
 * `attentionOnly` shows nothing unless something is wrong — for the home
 * screen, which should not narrate reminders that are fine.
 */
export function ReminderStatus({ attentionOnly = false }: { attentionOnly?: boolean }) {
  const theme = useTheme();
  const { health, resync } = useReminders();
  const { runWithSystemUi } = useAppLock();
  const { dndWarningSeen } = usePreferences();
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
                // Each line its own language's time: not "at 오후 1:00".
                time: timeInBoth({ hour: health.next.getHours(), minute: health.next.getMinutes() }),
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
      if (!health.now && dndWarningSeen) return nextLine(false);
      return (
        <View style={{ gap: Spacing.two }}>
          {nextLine(false)}
          {/* Amber, as anything that is not what it looks like: set is not sure to sound. */}
          <Notice tone="warn" title={warning} live>
            {letThrough}
            {health.now || explaining ? null : (
              <BigButton label={Strings.camera.done} tone="secondary" onPress={() => setDndWarningSeen(true)} />
            )}
          </Notice>
        </View>
      );
    }
    case 'on':
      return nextLine(true);
    case 'late':
      // The same words at home as on the page: they will sound, if late, so
      // "cannot sound right now" (homeWarning) would be untrue.
      return (
        <Notice tone="warn" title={Strings.reminders.statusLate} live>
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
    case 'blocked': {
      // Only the reminders' category may be off, with the app's notifications
      // on: said so, and its own page opened, where the switch is.
      const blocked = health.category ? Strings.reminders.statusCategoryOff : Strings.reminders.statusBlocked;
      return (
        <Notice tone="warn" title={attentionOnly ? Strings.reminders.homeWarning : blocked} body={attentionOnly ? blocked : undefined} live>
          {health.canAsk ? (
            <BigButton
              label={Strings.reminders.allow}
              tone="secondary"
              onPress={async () => {
                await runWithSystemUi(() => requestReminderPermission()).catch(() => false);
                await resync();
              }}
            />
          ) : health.category ? (
            <BigButton
              label={Strings.permission.openSettings}
              tone="secondary"
              onPress={() => {
                if (!openReminderChannelSettings()) void Linking.openSettings().catch(() => undefined);
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
    }
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
      // Not known either way: said as that at home too, not as "cannot sound".
      return (
        <Notice tone="warn" title={Strings.reminders.statusUnverified} live>
          <BigButton label={Strings.scan.retry} tone="secondary" onPress={() => void resync()} />
        </Notice>
      );
  }
}
