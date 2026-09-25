import type { MedicationProfile, ReminderTime } from '../medications/types.ts';

/**
 * The pure half of dose reminders: what should be scheduled, and how that
 * compares with what the phone says is scheduled. No platform calls here, so
 * all of it is tested on Node; `scheduler.ts` does the talking.
 */

/** Every reminder this app schedules carries this prefix, and nothing else does. */
export const REMINDER_PREFIX = 'dose:';

/**
 * How many reminder times the app will hold in all, across every medicine.
 *
 * iOS keeps at most 64 pending notifications per app and silently drops the
 * rest — the one failure this feature exists to avoid. Each daily time is one
 * repeating notification, so the cap is set comfortably below that; eight
 * medicines at six times a day is more than anyone this app is for will need.
 */
export const MAX_REMINDER_TIMES = 48;

/** The minute stepper's step: fine enough for 7:30 and 8:45, coarse enough to reach them. */
export const MINUTE_STEP = 5;

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * One reminder's identifier: the medicine and the time, `dose:<id>:0800`.
 *
 * Deterministic, so scheduling the same reminder twice replaces it instead of
 * doubling it, and so what the phone holds can be read back and matched to
 * what the vault says without storing a separate mapping.
 */
export function reminderId(medicationId: string, time: ReminderTime): string {
  return `${REMINDER_PREFIX}${medicationId}:${pad(time.hour)}${pad(time.minute)}`;
}

export function isReminderId(identifier: string): boolean {
  return identifier.startsWith(REMINDER_PREFIX);
}

export function parseReminderId(
  identifier: string
): { medicationId: string; time: ReminderTime } | null {
  const match = /^dose:(.+):(\d{2})(\d{2})$/.exec(identifier);
  if (!match) return null;
  const time = { hour: Number(match[2]), minute: Number(match[3]) };
  return isValidTime(time) ? { medicationId: match[1], time } : null;
}

export function isValidTime(time: ReminderTime): boolean {
  return (
    Number.isInteger(time.hour) &&
    Number.isInteger(time.minute) &&
    time.hour >= 0 &&
    time.hour <= 23 &&
    time.minute >= 0 &&
    time.minute <= 59
  );
}

export const sameTime = (a: ReminderTime, b: ReminderTime) => a.hour === b.hour && a.minute === b.minute;

const minutesOf = (time: ReminderTime) => time.hour * 60 + time.minute;

/** Sorted by time of day, invalid and repeated times dropped. */
export function normaliseTimes(times: readonly ReminderTime[]): ReminderTime[] {
  const sorted = times.filter(isValidTime).sort((a, b) => minutesOf(a) - minutesOf(b));
  return sorted.filter((time, index) => index === 0 || !sameTime(time, sorted[index - 1]));
}

export function totalReminderTimes(profile: MedicationProfile): number {
  return profile.medications.reduce((count, record) => count + (record.reminders?.length ?? 0), 0);
}

export type AddCheck = 'ok' | 'duplicate' | 'too-many' | 'invalid';

/** Whether `time` may be added to one medicine's reminders. */
export function checkNewTime(
  profile: MedicationProfile,
  medicationId: string,
  time: ReminderTime
): AddCheck {
  if (!isValidTime(time)) return 'invalid';
  const record = profile.medications.find((entry) => entry.id === medicationId);
  if (record?.reminders?.some((existing) => sameTime(existing, time))) return 'duplicate';
  if (totalReminderTimes(profile) >= MAX_REMINDER_TIMES) return 'too-many';
  return 'ok';
}

export type DesiredReminder = { readonly medicationId: string; readonly time: ReminderTime };

/** Every reminder the vault says should exist, by identifier. */
export function desiredReminders(profile: MedicationProfile): Map<string, DesiredReminder> {
  const desired = new Map<string, DesiredReminder>();
  for (const record of profile.medications) {
    for (const time of normaliseTimes(record.reminders ?? [])) {
      desired.set(reminderId(record.id, time), { medicationId: record.id, time });
    }
  }
  return desired;
}

/**
 * How what the phone holds differs from what should be: `stale` to cancel —
 * reminders for removed medicines or removed times — and `missing`, which
 * after a sync means the phone did not keep what it was given.
 */
export function compareSchedules(
  desired: ReadonlyMap<string, unknown>,
  scheduledIdentifiers: Iterable<string>
): { stale: string[]; missing: string[] } {
  const scheduled = new Set([...scheduledIdentifiers].filter(isReminderId));
  return {
    stale: [...scheduled].filter((identifier) => !desired.has(identifier)),
    missing: [...desired.keys()].filter((identifier) => !scheduled.has(identifier)),
  };
}

/** One step of the hour or minute stepper, wrapping round the clock. */
export function stepTime(time: ReminderTime, field: 'hour' | 'minute', direction: 1 | -1): ReminderTime {
  if (field === 'hour') return { ...time, hour: (time.hour + direction + 24) % 24 };
  // Snapped to the step, so 8:07 steps to 8:10, not 8:12.
  const snapped = Math.floor(time.minute / MINUTE_STEP) * MINUTE_STEP;
  const next = direction === 1 ? snapped + MINUTE_STEP : time.minute % MINUTE_STEP ? snapped : snapped - MINUTE_STEP;
  return { ...time, minute: (next + 60) % 60 };
}

/** Moves a time across midday, keeping its clock-face hour: 8:00 ⇄ 20:00. */
export function withPeriod(time: ReminderTime, period: 'am' | 'pm'): ReminderTime {
  const isPm = time.hour >= 12;
  if ((period === 'pm') === isPm) return time;
  return { ...time, hour: (time.hour + 12) % 24 };
}

/**
 * The words a time is written with: a template with `{h}`, `{mm}` and
 * `{period}`, and the words for morning and afternoon. Passed in from the
 * reviewed strings rather than taken from `Intl`, whose output is not the same
 * everywhere: Node 22's ICU writes Korean 8 a.m. as "AM 8:00", where a phone
 * may write "오전 8:00". A reminder time is too important to vary by device.
 */
export type TimeWords = { readonly template: string; readonly am: string; readonly pm: string };

export function formatReminderTime(time: ReminderTime, words: TimeWords): string {
  return words.template
    .replace('{h}', String(clockHour(time)))
    .replace('{mm}', pad(time.minute))
    .replace('{period}', time.hour < 12 ? words.am : words.pm);
}

/** The hour as the clock face shows it, 1–12. */
export function clockHour(time: ReminderTime): number {
  return time.hour % 12 === 0 ? 12 : time.hour % 12;
}
