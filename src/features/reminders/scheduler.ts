import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { MedicationProfile } from '@/features/medications/types';
import { Strings } from '@/i18n/strings';

import { DoseAlarms } from '../../../modules/dose-alarms';
import { compareSchedules, desiredReminders, isReminderId, parseReminderId } from './plan';

/**
 * Dose reminders, scheduled with the phone's own notification scheduler.
 *
 * The rule this file is built to: **a reminder that fails silently is worse
 * than none**, because someone who has been told they will be reminded stops
 * remembering for themselves. So nothing here reports "on" from what it asked
 * for. It reports what the phone says back — the scheduled list read after
 * writing, the next firing as the scheduler computes it, and every permission
 * that can quietly stop a notification from sounding. See docs/reminders.md.
 */

/** The Android notification channel reminders arrive on. */
export const CHANNEL_ID = 'dose-reminders';

export type ReminderHealth =
  /** No medicine has a reminder. */
  | { readonly kind: 'none' }
  /** Confirmed with the phone. `next` is the scheduler's own next firing. */
  | { readonly kind: 'on'; readonly next: Date | null }
  /** Confirmed, but Android may deliver them late: exact alarms are not allowed. */
  | { readonly kind: 'late'; readonly next: Date | null }
  /** Notifications are off for the app; nothing will sound. */
  | { readonly kind: 'blocked'; readonly canAsk: boolean }
  /**
   * They will arrive, but without a sound: the user turned the reminders'
   * sound off, or lowered them below the importance that makes one, in the
   * phone's own settings. A reminder that only appears is easily missed.
   */
  | { readonly kind: 'silent' }
  /** The phone did not keep what it was given, or could not be asked. */
  | { readonly kind: 'unverified' };

/** Health that means the user must be told reminders will not work as set. */
export const needsAttention = (health: ReminderHealth | null) =>
  health !== null &&
  (health.kind === 'blocked' || health.kind === 'silent' || health.kind === 'unverified' || health.kind === 'late');

let presentationConfigured = false;

/**
 * Shows a reminder that arrives while the app is open, rather than swallowing
 * it — the default when no handler is set.
 */
export function configureReminderPresentation(): void {
  if (presentationConfigured) return;
  presentationConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * The channel, created before anything is scheduled on it — and before the
 * permission is asked for: Android 13 does not show its permission prompt
 * until the app has a channel.
 *
 * Content on it is generic by construction, so it may show on the lock screen
 * in full; a medicine's name never reaches the notification.
 *
 * No `sound`: for a channel that is the name of a sound file bundled with the
 * app, and left out it is the phone's default notification sound. It used to
 * say 'default', which expo-notifications looked for as a file, logged as
 * missing on every launch, and only then fell back to the default sound.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: Strings.reminders.channelName.ko,
    description: Strings.reminders.channelDescription.ko,
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    vibrationPattern: [0, 400, 250, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
  });
}

/**
 * Whether notifications can reach the user at all.
 *
 * On iOS only full authorisation counts. "Provisional" delivers quietly to the
 * notification centre with no sound and no banner — a reminder nobody notices,
 * which is the failure this feature exists to prevent.
 */
export async function notificationPermission(): Promise<{ granted: boolean; canAsk: boolean }> {
  const status = await Notifications.getPermissionsAsync();
  const granted =
    Platform.OS === 'ios'
      ? status.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
      : status.granted;
  return { granted, canAsk: !granted && status.canAskAgain };
}

/** Asks for notifications, after the explanation the caller has shown. */
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel();
  await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return (await notificationPermission()).granted;
}

/**
 * Android only: whether reminders will be exact. `null` where it cannot be
 * told — a build made before the native module existed — which counts as
 * exact rather than raising an alarm about something unknown; iOS delivers
 * calendar notifications on time without asking.
 */
function exactAlarmsAllowed(): boolean | null {
  if (Platform.OS !== 'android') return true;
  try {
    return DoseAlarms?.canScheduleExactAlarms() ?? null;
  } catch {
    return null;
  }
}

/** Opens Android's "Alarms & reminders" setting for the app. */
export function openExactAlarmSettings(): boolean {
  try {
    return DoseAlarms?.openExactAlarmSettings() ?? false;
  } catch {
    return false;
  }
}

function content(medicationId: string): Notifications.NotificationContentInput {
  return {
    title: Strings.reminders.notificationTitle.ko,
    body: Strings.reminders.notificationBody.ko,
    // An identifier, not a name: enough to open the right page after unlock.
    data: { kind: 'dose', medicationId },
    // The default sound, on iOS. (On Android 8 and later the channel decides.)
    sound: 'default',
  };
}

/**
 * Whether a reminder will make a sound, as the phone holds its settings now:
 * the user can turn the sound off where the app cannot see it happen. On
 * Android that is the channel, read back as the phone has it (not as it was
 * created: the user's changes to a channel win, and the app cannot undo
 * them); on iOS, the app's "Sounds" switch. `null` when the channel is not
 * there at all, which means a reminder on it would not appear.
 */
async function remindersSound(status: Notifications.NotificationPermissionsStatus): Promise<boolean | null> {
  if (Platform.OS === 'ios') return status.ios?.allowsSound !== false;
  if (Platform.OS !== 'android') return true;
  const channel = await Notifications.getNotificationChannelAsync(CHANNEL_ID);
  if (!channel) return null;
  return channel.importance >= Notifications.AndroidImportance.DEFAULT && channel.sound !== null;
}

async function scheduledReminderIds(): Promise<string[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.map((request) => request.identifier).filter(isReminderId);
}

/**
 * Makes the phone's schedule match the profile, then checks that it does.
 *
 * Every desired reminder is scheduled again, not only the missing ones. Doing
 * so is idempotent — the identifier is the same, so it replaces — and it
 * re-arms anything the phone lost without saying so: on Android a force-stop
 * cancels every alarm while leaving the stored list that `getAll…` reads, so
 * a reminder can look scheduled and never fire.
 */
export async function syncReminders(profile: MedicationProfile): Promise<ReminderHealth> {
  const desired = desiredReminders(profile);

  const { stale } = compareSchedules(desired, await scheduledReminderIds());
  for (const identifier of stale) await Notifications.cancelScheduledNotificationAsync(identifier);
  if (desired.size === 0) return { kind: 'none' };

  await ensureChannel();
  for (const [identifier, { medicationId, time }] of desired) {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: content(medicationId),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
        channelId: CHANNEL_ID,
      },
    });
  }

  // Read back. Anything asked for and not held, or held and not asked for,
  // means the phone's schedule is not the one the user set.
  const after = compareSchedules(desired, await scheduledReminderIds());
  if (after.missing.length > 0 || after.stale.length > 0) return { kind: 'unverified' };

  const allowed = await notificationPermission();
  if (!allowed.granted) return { kind: 'blocked', canAsk: allowed.canAsk };

  const sounds = await remindersSound(await Notifications.getPermissionsAsync());
  if (sounds === null) return { kind: 'unverified' };
  if (!sounds) return { kind: 'silent' };

  const next = await nextFiring([...desired.values()].map((reminder) => reminder.time));
  return exactAlarmsAllowed() === false ? { kind: 'late', next } : { kind: 'on', next };
}

/**
 * The soonest firing, as the platform's scheduler computes it — the same code
 * that arms the alarm, rather than this app's own arithmetic about clocks.
 */
async function nextFiring(times: { hour: number; minute: number }[]): Promise<Date | null> {
  let soonest: number | null = null;
  for (const time of times) {
    const at = await Notifications.getNextTriggerDateAsync({
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
    });
    if (at !== null && (soonest === null || at < soonest)) soonest = at;
  }
  return soonest === null ? null : new Date(soonest);
}

/**
 * Android, at every launch and before the lock: re-arms each stored reminder
 * from the scheduler's own copy, without reading the vault.
 *
 * A force-stop cancels the alarms and keeps the list, and nothing re-arms them
 * until the app next runs; this is that run. Before unlock, so that opening the
 * app and leaving it at the lock screen is enough. The copy is generic content
 * and an identifier, so re-arming from it needs no medication data.
 */
export async function rearmStoredReminders(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    const parsed = parseReminderId(request.identifier);
    if (!parsed) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: request.identifier,
      content: content(parsed.medicationId),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: parsed.time.hour,
        minute: parsed.time.minute,
        channelId: CHANNEL_ID,
      },
    });
  }
}

/** Cancels every reminder: part of erasing everything. */
export async function cancelAllReminders(): Promise<void> {
  for (const identifier of await scheduledReminderIds()) {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  }
}

/** The medicine a tapped reminder is for, if it is one of ours. */
export function medicationFromResponse(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data as
    | { kind?: unknown; medicationId?: unknown }
    | undefined;
  return data?.kind === 'dose' && typeof data.medicationId === 'string' ? data.medicationId : null;
}
