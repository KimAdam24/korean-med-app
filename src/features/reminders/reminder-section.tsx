import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card, CardDivider } from '@/components/card';
import { Notice } from '@/components/notice';
import { Radius, Spacing } from '@/constants/theme';
import { updateMedication } from '@/features/medications/medication-store';
import type { MedicationProfile, MedicationRecord, ReminderTime } from '@/features/medications/types';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate, type Bilingual } from '@/i18n/strings';

import { MAX_REMINDER_TIMES, checkNewTime, formatReminderTime, normaliseTimes, sameTime } from './plan';
import { ReminderStatus } from './reminder-status';
import { useReminders } from './reminders-context';
import { notificationPermission, requestReminderPermission } from './scheduler';
import { TimePicker, timeWords } from './time-picker';

type Mode =
  | { kind: 'idle' }
  | { kind: 'adding'; time: ReminderTime }
  /** The permission explained, before the phone asks; `time` is saved either way. */
  | { kind: 'asking'; time: ReminderTime }
  | { kind: 'saving' };

/**
 * One medicine's reminder times, on its page.
 *
 * The times are kept on the record, in the vault; the phone's scheduler is
 * brought into line with them by `resync` after every change, and its answer —
 * not the change itself — is what the status beneath the times reports.
 *
 * Notifications are asked for when the first reminder is set, with a sentence
 * of reason first, because a permission asked for cold is the one most often
 * refused. A time is saved even if the answer is no: the status then says,
 * with the remedy beside it, that the reminder cannot sound — rather than the
 * app quietly deciding the reminder does not exist.
 */
export function ReminderSection({
  record,
  profile,
  onChanged,
}: {
  record: MedicationRecord;
  profile: MedicationProfile;
  /** Re-reads the profile after a change, so the screen shows what is stored. */
  onChanged: () => Promise<void>;
}) {
  const theme = useTheme();
  const { resync } = useReminders();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [message, setMessage] = useState<Bilingual | null>(null);
  const times = normaliseTimes(record.reminders ?? []);
  const words = timeWords();

  const save = async (next: ReminderTime[]) => {
    setMode({ kind: 'saving' });
    try {
      await updateMedication(record.id, { reminders: next.length > 0 ? normaliseTimes(next) : undefined });
    } catch {
      setMessage(Strings.reminders.saveFailed);
      setMode({ kind: 'idle' });
      return;
    }
    await onChanged();
    await resync();
    setMode({ kind: 'idle' });
  };

  const add = async (time: ReminderTime) => {
    setMessage(null);
    const check = checkNewTime(profile, record.id, time);
    if (check === 'duplicate') return setMessage(Strings.reminders.duplicate);
    if (check === 'too-many') return setMessage(fillTemplate(Strings.reminders.tooMany, { max: MAX_REMINDER_TIMES }));
    if (check === 'invalid') return;

    const allowed = await notificationPermission().catch(() => ({ granted: false, canAsk: false }));
    if (!allowed.granted && allowed.canAsk) {
      setMode({ kind: 'asking', time });
      return;
    }
    await save([...times, time]);
  };

  const firstFree = () =>
    [8, 12, 18, 21].map((hour) => ({ hour, minute: 0 })).find((time) => !times.some((t) => sameTime(t, time))) ?? {
      hour: 8,
      minute: 0,
    };

  return (
    <Card>
      <BilingualText text={Strings.reminders.title} variant="title" />

      {times.length === 0 ? (
        <BilingualText text={Strings.reminders.none} variant="label" color={theme.textSecondary} />
      ) : (
        times.map((time, index) => {
          const shown = formatReminderTime(time, words);
          return (
            <View key={`${time.hour}:${time.minute}`}>
              {index > 0 ? <CardDivider /> : null}
              <View style={styles.timeRow}>
                <BilingualText text={{ ko: shown, en: '' }} variant="title" style={styles.timeText} />
                <Pressable
                  onPress={() => void save(times.filter((existing) => !sameTime(existing, time)))}
                  disabled={mode.kind === 'saving'}
                  accessibilityRole="button"
                  accessibilityLabel={fillTemplate(Strings.reminders.removeLabel, { time: shown }).ko}
                  style={({ pressed }) => [
                    styles.remove,
                    { borderColor: theme.warnAccent, backgroundColor: pressed ? theme.backgroundSelected : theme.surface },
                  ]}>
                  <BilingualText text={Strings.reminders.remove} variant="label" color={theme.warnAccent} />
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      {times.length > 0 ? <ReminderStatus /> : null}
      {message ? <Notice tone="warn" title={message} live /> : null}

      {mode.kind === 'saving' ? (
        <ActivityIndicator size="large" color={theme.primaryIcon} />
      ) : mode.kind === 'asking' ? (
        <>
          <BilingualText text={Strings.reminders.askTitle} variant="title" autoFocus />
          <BilingualText text={Strings.reminders.askBody} />
          <BigButton
            label={Strings.reminders.askContinue}
            onPress={async () => {
              await requestReminderPermission().catch(() => false);
              await save([...times, mode.time]);
            }}
          />
          <BigButton label={Strings.onboarding.notNow} tone="secondary" onPress={() => void save([...times, mode.time])} />
        </>
      ) : mode.kind === 'adding' ? (
        <>
          <TimePicker value={mode.time} onChange={(time) => setMode({ kind: 'adding', time })} />
          <BigButton label={Strings.reminders.saveTime} onPress={() => void add(mode.time)} />
          <BigButton
            label={Strings.medications.cancel}
            tone="secondary"
            onPress={() => {
              setMessage(null);
              setMode({ kind: 'idle' });
            }}
          />
        </>
      ) : (
        <BigButton
          label={Strings.reminders.add}
          icon="alarm"
          tone="secondary"
          onPress={() => setMode({ kind: 'adding', time: firstFree() })}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  timeText: {
    flex: 1,
  },
  remove: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: 2,
    borderRadius: Radius.inner,
    borderCurve: 'continuous',
  },
});
