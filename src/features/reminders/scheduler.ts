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
  /**
   * Confirmed with the phone, and nothing it reports can stop them: Do Not
   * Disturb included, which they are let through. `next` is the scheduler's
   * own next firing.
   */
  | { readonly kind: 'on'; readonly next: Date | null }
  /**
   * Scheduled, and allowed to sound, but Do Not Disturb (on iOS, a Focus) will
   * silence them while it is on, and the phone does not say when that will
   * be: so not "on". `now` when it is on at this moment, and they cannot
   * sound now. `letThrough` when the reminders' own setting that lets them
   * through it can be opened, and would help (Android 8 and later).
   */
  | { readonly kind: 'dnd'; readonly next: Date | null; readonly now: boolean; readonly letThrough: boolean }
  /** Confirmed, but Android may deliver them late: exact alarms are not allowed. */
  | { readonly kind: 'late'; readonly next: Date | null }
  /**
   * Nothing will appear: notifications are off for the app, or (`category`)
   * only the reminders' own category is, in the phone's settings.
   */
  | { readonly kind: 'blocked'; readonly canAsk: boolean; readonly category?: boolean }
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
  (health.kind === 'blocked' ||
    health.kind === 'silent' ||
    health.kind === 'unverified' ||
    health.kind === 'late' ||
    // Only while it is on: "cannot sound right now" is then true. That it
    // could be on later is said on the medicine's page, beside the times.
    (health.kind === 'dnd' && health.now));

/**
 * The scheduler's work, one piece at a time, whoever asks: a sync after
 * unlock, the re-arm at launch, the cancelling of an erase. Interleaved, they
 * undid each other: a re-arm brought back a reminder a sync had just
 * cancelled, and a sync in flight re-scheduled one an erase had cancelled.
 */
let queue: Promise<unknown> = Promise.resolve();
function serially<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

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
  return permissionOf(await Notifications.getPermissionsAsync());
}

function permissionOf(status: Notifications.NotificationPermissionsStatus): { granted: boolean; canAsk: boolean } {
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

/** Android's Do Not Disturb filters (`NotificationManager.INTERRUPTION_FILTER_*`). */
const FILTER = { ALL: 1, PRIORITY: 2, NONE: 3, ALARMS: 4 } as const;

/**
 * Android: the Do Not Disturb filter in force now, from the app's native
 * module, or else as expo-notifications reports it with the permission; null
 * where neither can tell.
 */
function interruptionFilterNow(status: Notifications.NotificationPermissionsStatus): number | null {
  if (Platform.OS !== 'android') return null;
  const usable = (filter: unknown) => (typeof filter === 'number' && filter > 0 ? filter : null);
  try {
    const filter = usable(DoseAlarms?.interruptionFilter?.());
    if (filter !== null) return filter;
  } catch {
    // Read from the permission instead.
  }
  return usable(status.android?.interruptionFilter);
}

/**
 * What Do Not Disturb can do to the reminders, as far as the phone says.
 *
 * - Android 8 and later: whether the reminders' channel may bypass it, read
 *   back. Only the user can turn that on, on the channel's own page: Android
 *   ignores an app's own request to bypass unless the app has Do Not Disturb
 *   access, which would let it change Do Not Disturb too, and is not asked
 *   for. Let through, they sound in "priority only" Do Not Disturb; nothing
 *   sounds in "none" or "alarms only".
 * - Below Android 8 the app-wide override cannot be read: not known to pass.
 * - iOS: a Focus silences them unless the app is allowed in it, which the app
 *   cannot read. Not known to pass, and no setting the app can open.
 *
 * Not seen anywhere: when Do Not Disturb will next be on, and, on Android 15,
 * a mode set to let no apps through at all.
 */
function doNotDisturb(
  status: Notifications.NotificationPermissionsStatus,
  channel: Notifications.NotificationChannel | null
): { passes: boolean; now: boolean; letThrough: boolean } {
  if (Platform.OS !== 'android') return { passes: false, now: false, letThrough: false };
  const filter = interruptionFilterNow(status);
  const silencesAll = filter === FILTER.NONE || filter === FILTER.ALARMS;
  if (Number(Platform.Version) < FIRST_API_WITH_CHANNELS) {
    return { passes: false, now: silencesAll, letThrough: false };
  }
  const bypass = channel?.bypassDnd === true;
  return {
    passes: bypass && !silencesAll,
    now: silencesAll || (filter === FILTER.PRIORITY && !bypass),
    letThrough: !bypass && !silencesAll,
  };
}

/**
 * Opens the reminders' own channel page, where "Override Do Not Disturb" is,
 * after the explanation the caller has shown. False where it cannot be opened.
 */
export function openReminderChannelSettings(): boolean {
  try {
    return DoseAlarms?.openChannelSettings?.(CHANNEL_ID) ?? false;
  } catch {
    return false;
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

/** Android 8 (API 26) brought notification channels; before it, the notification itself carries the sound. */
const FIRST_API_WITH_CHANNELS = 26;

/**
 * Whether a reminder will appear with a sound, as the phone holds its settings
 * now: the user can change them where the app cannot see it happen.
 *
 * - On Android 8 and later, the channel, read back as the phone has it (not
 *   as it was created: the user's changes win, and the app cannot undo them).
 *   Turned off ("blocked", importance NONE or below), nothing appears at all;
 *   lowered below DEFAULT, or its sound off, it appears without one. Missing
 *   altogether, a reminder on it would not appear: `unknown`.
 * - Before Android 8 there are no channels (the module answers null for any):
 *   the reminder's own `sound: 'default'` sounds, as permission allows.
 * - On iOS, the app's "Sounds" switch.
 *
 * Not seen here: Do Not Disturb and Focus (`doNotDisturb`), and the ringer
 * or notification volume.
 */
function reminderSound(
  status: Notifications.NotificationPermissionsStatus,
  channel: Notifications.NotificationChannel | null
): 'sounds' | 'silent' | 'blocked' | 'unknown' {
  if (Platform.OS === 'ios') return status.ios?.allowsSound === false ? 'silent' : 'sounds';
  if (Platform.OS !== 'android') return 'sounds';
  if (Number(Platform.Version) < FIRST_API_WITH_CHANNELS) return 'sounds';
  if (!channel) return 'unknown';
  if (channel.importance <= Notifications.AndroidImportance.NONE) return 'blocked';
  return channel.importance >= Notifications.AndroidImportance.DEFAULT && channel.sound !== null ? 'sounds' : 'silent';
}

async function scheduledReminders(): Promise<Notifications.NotificationRequest[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.filter((request) => isReminderId(request.identifier));
}

async function scheduledReminderIds(): Promise<string[]> {
  return (await scheduledReminders()).map((request) => request.identifier);
}

function schedule(identifier: string, medicationId: string, time: { hour: number; minute: number }) {
  return Notifications.scheduleNotificationAsync({
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

/** Whether a scheduled reminder still says what this build would have it say. */
function saysCurrent(request: Notifications.NotificationRequest, medicationId: string): boolean {
  const now = content(medicationId);
  return request.content.title === now.title && request.content.body === now.body;
}

/**
 * Makes the phone's schedule match the profile, then checks that it does.
 *
 * Only what is missing is scheduled, and what says outdated words. A
 * reminder already held is left alone: scheduling it again arms it for its
 * next time from now, so one due at 8:00 and waiting to be delivered (an
 * inexact alarm, deferred while the phone dozes) was moved to tomorrow by a
 * sync at 8:05, and today's never came. Alarms the phone lost while keeping
 * its list, as a force-stop does, are re-armed at the next launch
 * (`rearmStoredReminders`).
 */
export function syncReminders(
  profile: MedicationProfile,
  /**
   * Medicines saved but not readable by this build: what the phone holds for
   * them is left as it is, neither cancelled as stale nor counted against
   * "on" (see `unreadableMedicationIds`).
   */
  unreadable: readonly string[] = []
): Promise<ReminderHealth> {
  return serially(() => syncOnce(profile, unreadable));
}

async function syncOnce(profile: MedicationProfile, unreadable: readonly string[]): Promise<ReminderHealth> {
  const desired = desiredReminders(profile);
  const theirs = (identifier: string) => {
    const reminder = parseReminderId(identifier);
    return reminder !== null && unreadable.includes(reminder.medicationId);
  };

  const held = await scheduledReminders();
  const { stale } = compareSchedules(
    desired,
    held.map((request) => request.identifier)
  );
  for (const identifier of stale.filter((id) => !theirs(id))) {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  }
  if (desired.size === 0) return { kind: 'none' };

  await ensureChannel();
  const holding = new Map(held.map((request) => [request.identifier, request]));
  for (const [identifier, { medicationId, time }] of desired) {
    const request = holding.get(identifier);
    if (request && saysCurrent(request, medicationId)) continue;
    await schedule(identifier, medicationId, time);
  }

  // Read back. Anything asked for and not held, or held and not asked for,
  // means the phone's schedule is not the one the user set.
  const after = compareSchedules(desired, await scheduledReminderIds());
  if (after.missing.length > 0 || after.stale.some((id) => !theirs(id))) return { kind: 'unverified' };

  // The permission and the channel, each read once.
  const status = await Notifications.getPermissionsAsync();
  const allowed = permissionOf(status);
  if (!allowed.granted) return { kind: 'blocked', canAsk: allowed.canAsk };
  // Asked as everywhere else here: below Android 8 there are no channels.
  const channel =
    Platform.OS === 'android' && !(Number(Platform.Version) < FIRST_API_WITH_CHANNELS)
      ? await Notifications.getNotificationChannelAsync(CHANNEL_ID)
      : null;

  const sound = reminderSound(status, channel);
  if (sound === 'unknown') return { kind: 'unverified' };
  // The reminders' category turned off: they will not appear, let alone
  // sound, and only the phone's settings can turn it back on. Not the app's
  // notifications, which are on.
  if (sound === 'blocked') return { kind: 'blocked', canAsk: false, category: true };
  if (sound === 'silent') return { kind: 'silent' };

  const next = await nextFiring([...desired.values()].map((reminder) => reminder.time));
  const dnd = doNotDisturb(status, channel);
  // On now, it stops them now: said first. Late can be put right meanwhile.
  if (dnd.now) return { kind: 'dnd', next, now: true, letThrough: dnd.letThrough };
  if (exactAlarmsAllowed() === false) return { kind: 'late', next };
  // Not "on" while Do Not Disturb could silence them unseen.
  if (!dnd.passes) return { kind: 'dnd', next, now: false, letThrough: dnd.letThrough };
  return { kind: 'on', next };
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
export function rearmStoredReminders(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  // Re-arming moves an alarm that is due and waiting to be delivered to
  // tomorrow (see `syncReminders`), so it is done only where the alarms were
  // lost: after the app was force-stopped, or where that cannot be told.
  if (!alarmsMayBeLost()) return Promise.resolve();
  return serially(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of scheduled) {
      const parsed = parseReminderId(request.identifier);
      if (parsed) await schedule(request.identifier, parsed.medicationId, parsed.time);
    }
  });
}

/**
 * How the app's last process ended (`ApplicationExitInfo`), where that kept
 * its alarms: it exited, was killed for memory, crashed, was swiped away.
 * Any other ending, a force-stop (10, 11), a revoked permission (8, which
 * cancels exact alarms), an update or a change of state (15, 16), or one not
 * known, may have cancelled them.
 */
const ALARMS_KEPT = new Set([1, 2, 3, 4, 5, 6, 7, 9, 12, 13, 14]);

function alarmsMayBeLost(): boolean {
  try {
    const reason = DoseAlarms?.lastExitReason?.();
    return typeof reason !== 'number' || !ALARMS_KEPT.has(reason);
  } catch {
    return true;
  }
}

/** Cancels every reminder: part of erasing everything. */
export function cancelAllReminders(): Promise<void> {
  return serially(async () => {
    for (const identifier of await scheduledReminderIds()) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    }
  });
}

/** The medicine a tapped reminder is for, if it is one of ours. */
export function medicationFromResponse(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data as
    | { kind?: unknown; medicationId?: unknown }
    | undefined;
  return data?.kind === 'dose' && typeof data.medicationId === 'string' ? data.medicationId : null;
}
