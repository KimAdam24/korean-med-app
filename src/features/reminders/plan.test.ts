/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { MedicationProfile, MedicationRecord } from '../medications/types.ts';
import {
  checkNewTime,
  clockHour,
  compareSchedules,
  desiredReminders,
  formatReminderTime,
  MAX_REMINDER_TIMES,
  normaliseTimes,
  parseReminderId,
  reminderId,
  stepTime,
  withPeriod,
} from './plan.ts';

const record = (id: string, reminders?: MedicationRecord['reminders']): MedicationRecord => ({
  id,
  name: 'LISINOPRIL',
  addedAt: '2026-09-25T00:00:00Z',
  source: 'manual',
  needsReview: false,
  ...(reminders ? { reminders } : {}),
});
const profile = (...medications: MedicationRecord[]): MedicationProfile => ({ version: 1, medications });

test('an identifier names the medicine and the time, and reads back', () => {
  const id = reminderId('abc-123', { hour: 8, minute: 5 });
  assert.equal(id, 'dose:abc-123:0805');
  assert.deepEqual(parseReminderId(id), { medicationId: 'abc-123', time: { hour: 8, minute: 5 } });
  assert.equal(parseReminderId('dose:abc:2460'), null);
  assert.equal(parseReminderId('other:abc:0800'), null);
});

test('times are sorted, and a time set twice is one reminder', () => {
  assert.deepEqual(
    normaliseTimes([
      { hour: 21, minute: 0 },
      { hour: 8, minute: 0 },
      { hour: 8, minute: 0 },
      { hour: 25, minute: 0 },
    ]),
    [
      { hour: 8, minute: 0 },
      { hour: 21, minute: 0 },
    ]
  );
});

test('what should be scheduled comes from every medicine, and nothing else', () => {
  const desired = desiredReminders(
    profile(record('a', [{ hour: 8, minute: 0 }, { hour: 20, minute: 0 }]), record('b'))
  );
  assert.deepEqual([...desired.keys()], ['dose:a:0800', 'dose:a:2000']);
});

test('the comparison finds reminders to cancel and reminders the phone did not keep', () => {
  const desired = desiredReminders(profile(record('a', [{ hour: 8, minute: 0 }])));
  assert.deepEqual(compareSchedules(desired, ['dose:a:0800', 'dose:gone:0900', 'someone-else']), {
    stale: ['dose:gone:0900'],
    missing: [],
  });
  assert.deepEqual(compareSchedules(desired, []), { stale: [], missing: ['dose:a:0800'] });
});

test('a new time is refused when it repeats one, or when the phone could not hold it', () => {
  const current = profile(record('a', [{ hour: 8, minute: 0 }]));
  assert.equal(checkNewTime(current, 'a', { hour: 8, minute: 0 }), 'duplicate');
  assert.equal(checkNewTime(current, 'a', { hour: 9, minute: 0 }), 'ok');
  assert.equal(checkNewTime(current, 'a', { hour: 9, minute: 61 }), 'invalid');

  const times = Array.from({ length: MAX_REMINDER_TIMES }, (_, index) => ({
    hour: Math.floor(index / 12),
    minute: (index % 12) * 5,
  }));
  assert.equal(checkNewTime(profile(record('a', times)), 'b', { hour: 23, minute: 55 }), 'too-many');
});

test('the steppers wrap round the clock, and minutes snap to the step', () => {
  assert.deepEqual(stepTime({ hour: 23, minute: 0 }, 'hour', 1), { hour: 0, minute: 0 });
  assert.deepEqual(stepTime({ hour: 0, minute: 0 }, 'hour', -1), { hour: 23, minute: 0 });
  assert.deepEqual(stepTime({ hour: 8, minute: 55 }, 'minute', 1), { hour: 8, minute: 0 });
  assert.deepEqual(stepTime({ hour: 8, minute: 0 }, 'minute', -1), { hour: 8, minute: 55 });
  assert.deepEqual(stepTime({ hour: 8, minute: 7 }, 'minute', 1), { hour: 8, minute: 10 });
  assert.deepEqual(stepTime({ hour: 8, minute: 7 }, 'minute', -1), { hour: 8, minute: 5 });
});

test('morning and afternoon keep the clock-face hour', () => {
  assert.deepEqual(withPeriod({ hour: 8, minute: 30 }, 'pm'), { hour: 20, minute: 30 });
  assert.deepEqual(withPeriod({ hour: 12, minute: 0 }, 'am'), { hour: 0, minute: 0 });
  assert.deepEqual(withPeriod({ hour: 20, minute: 0 }, 'pm'), { hour: 20, minute: 0 });
  assert.equal(clockHour({ hour: 0, minute: 0 }), 12);
  assert.equal(clockHour({ hour: 13, minute: 0 }), 1);
});

test('a time is written from the reviewed words, not the platform locale', () => {
  const korean = { template: '{period} {h}:{mm}', am: '오전', pm: '오후' };
  const english = { template: '{h}:{mm} {period}', am: 'AM', pm: 'PM' };
  assert.equal(formatReminderTime({ hour: 8, minute: 0 }, korean), '오전 8:00');
  assert.equal(formatReminderTime({ hour: 20, minute: 5 }, korean), '오후 8:05');
  assert.equal(formatReminderTime({ hour: 0, minute: 30 }, english), '12:30 AM');
  assert.equal(formatReminderTime({ hour: 12, minute: 0 }, english), '12:00 PM');
});
