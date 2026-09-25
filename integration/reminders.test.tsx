/**
 * Dose reminders, end to end through the real screens, against a scheduler
 * fake that can refuse, forget and be read back.
 *
 * The standard these hold the feature to: a reminder that fails silently is
 * worse than none. So every test checks what the phone was actually given and
 * what the user is told about it — never only that a button was pressed.
 */
import { act, screen } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import {
  APP_LOAD_BUDGET_MS,
  alreadySetUp,
  forgetAppStateListeners,
  launchApp,
  loadApp,
  press,
  sendAppTo,
} from './app-harness';
import { biometrics } from './fakes/local-authentication';
import * as NotificationsFake from './fakes/notifications';
import { doseAlarms, notifications } from './fakes/notifications';

import * as store from '@/features/medications/medication-store';
import type { ReminderTime } from '@/features/medications/types';
import { MAX_REMINDER_TIMES } from '@/features/reminders/plan';
import { Strings, fillTemplate } from '@/i18n/strings';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);
afterEach(() => jest.restoreAllMocks());

const R = Strings.reminders;
const on = (time: string) => fillTemplate(R.statusOn, { time }).ko;

async function medicine(reminders?: ReminderTime[]) {
  return store.addMedication({
    name: 'LISINOPRIL',
    dosage: '10 MG',
    source: 'manual',
    needsReview: false,
    ...(reminders ? { reminders } : {}),
  });
}

async function openMedicine(id: string) {
  launchApp(`/medication/${id}`);
  await screen.findByText('LISINOPRIL');
}

function onAndroid() {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  return () => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
}

describe('setting a reminder', () => {
  it('explains, asks for notifications, schedules it with the phone, and says when it will ring', async () => {
    notifications.notYetAsked('allow');
    const record = await medicine();
    await openMedicine(record.id);

    press(R.add.ko);
    press(R.saveTime.ko);
    // The reason comes before the phone's own question.
    await screen.findByText(R.askTitle.ko);
    expect(notifications.state.requests).toBe(0);
    press(R.askContinue.ko);

    await screen.findByText(on('8:00 AM'));
    expect(notifications.state.requests).toBe(1);
    const scheduled = notifications.state.scheduled.get(`dose:${record.id}:0800`);
    expect(scheduled?.trigger).toMatchObject({ type: 'daily', hour: 8, minute: 0, channelId: 'dose-reminders' });

    const stored = await store.loadProfile();
    expect(stored.status === 'ok' && stored.value.medications[0].reminders).toEqual([{ hour: 8, minute: 0 }]);
  });

  it('never puts the medicine in the notification, which the lock screen shows', async () => {
    const record = await medicine([{ hour: 8, minute: 0 }]);
    await openMedicine(record.id);
    await screen.findByText(on('8:00 AM'));

    for (const content of notifications.scheduledContents()) {
      expect(JSON.stringify([content.title, content.body])).not.toMatch(/LISINOPRIL|10 MG/);
      expect(content.data).toEqual({ kind: 'dose', medicationId: record.id });
    }
  });

  it('keeps a refused reminder, and says it cannot sound, with the way to fix it', async () => {
    notifications.notYetAsked('refuse');
    const record = await medicine();
    await openMedicine(record.id);
    press(R.add.ko);
    press(R.saveTime.ko);
    await screen.findByText(R.askTitle.ko);
    press(R.askContinue.ko);

    await screen.findByText(R.statusBlocked.ko);
    expect(screen.queryByText(on('8:00 AM'))).toBeNull();
    expect(screen.getByRole('button', { name: Strings.permission.openSettings.ko })).toBeTruthy();
  });

  it('refuses a time already set, and more times than the phone can hold', async () => {
    const record = await medicine([{ hour: 8, minute: 0 }]);
    await openMedicine(record.id);
    press(R.add.ko);
    press('8:00 AM');
    press(R.saveTime.ko);
    await screen.findByText(R.duplicate.ko);
  });

  it('stops at the cap below the phone’s own limit', async () => {
    const times = Array.from({ length: MAX_REMINDER_TIMES }, (_, index) => ({
      hour: Math.floor(index / 12),
      minute: (index % 12) * 5,
    }));
    await medicine(times);
    const other = await store.addMedication({ name: 'METFORMIN', source: 'manual', needsReview: false });
    launchApp(`/medication/${other.id}`);
    await screen.findByText('METFORMIN');
    press(R.add.ko);
    press(R.saveTime.ko);
    await screen.findByText(fillTemplate(R.tooMany, { max: MAX_REMINDER_TIMES }).ko);
  });
});

describe('what the app says about its reminders', () => {
  it('reports a reminder the phone did not keep, instead of claiming it is on', async () => {
    const record = await medicine();
    await openMedicine(record.id);
    notifications.dropNextSchedule();
    press(R.add.ko);
    press(R.saveTime.ko);

    await screen.findByText(R.statusUnverified.ko);
    expect(screen.queryByText(on('8:00 AM'))).toBeNull();

    press(Strings.scan.retry.ko);
    await screen.findByText(on('8:00 AM'));
  });

  it('warns on the home screen when reminders cannot sound', async () => {
    await medicine([{ hour: 8, minute: 0 }]);
    notifications.turnedOff();
    launchApp();
    await screen.findByText(R.homeWarning.ko);
    expect(screen.getByText(R.statusBlocked.ko)).toBeTruthy();
  });

  it('says nothing on the home screen when reminders are fine', async () => {
    await medicine([{ hour: 8, minute: 0 }]);
    launchApp();
    await screen.findByText(Strings.home.capture.ko);
    await act(async () => undefined);
    expect(screen.queryByText(R.homeWarning.ko)).toBeNull();
  });

  it('checks again on coming back to the app: notifications turned off while away', async () => {
    const record = await medicine([{ hour: 8, minute: 0 }]);
    await openMedicine(record.id);
    await screen.findByText(on('8:00 AM'));

    notifications.turnedOff();
    await sendAppTo('active');
    await screen.findByText(R.statusBlocked.ko);
  });
});

describe('taking reminders away', () => {
  it('cancels a removed time with the phone, and keeps the others', async () => {
    const record = await medicine([
      { hour: 8, minute: 0 },
      { hour: 20, minute: 0 },
    ]);
    await openMedicine(record.id);
    await screen.findByText(on('8:00 AM'));

    press(fillTemplate(R.removeLabel, { time: '8:00 AM' }).ko);
    await screen.findByText(on('8:00 PM'));
    expect([...notifications.state.scheduled.keys()]).toEqual([`dose:${record.id}:2000`]);
  });

  it('cancels a removed medicine’s reminders', async () => {
    const record = await medicine([{ hour: 8, minute: 0 }]);
    await openMedicine(record.id);
    await screen.findByText(on('8:00 AM'));

    press(Strings.medications.remove.ko);
    press(Strings.medications.removeConfirmYes.ko);
    await screen.findByText(Strings.medications.emptyTitle.ko);
    await act(async () => undefined);
    expect(notifications.state.scheduled.size).toBe(0);
  });

  it('cancels every reminder when everything is erased', async () => {
    await medicine([{ hour: 8, minute: 0 }]);
    launchApp('/settings');
    await screen.findByText(Strings.settings.storageNotice.ko);
    expect(notifications.state.scheduled.size).toBe(1);

    press(Strings.settings.eraseTitle.ko);
    press(Strings.settings.eraseConfirm.ko);
    await screen.findByText(Strings.settings.eraseDone.ko);
    expect(notifications.state.scheduled.size).toBe(0);
  });
});

describe('on Android', () => {
  it('says reminders may be late without exact alarms, and opens the setting that fixes it', async () => {
    const restore = onAndroid();
    try {
      doseAlarms.exact = false;
      const record = await medicine([{ hour: 8, minute: 0 }]);
      await openMedicine(record.id);
      await screen.findByText(R.statusLate.ko);
      press(R.openAlarmSettings.ko);
      expect(doseAlarms.opened).toBe(1);
      // The channel is made before anything is scheduled on it.
      expect(notifications.state.channels.has('dose-reminders')).toBe(true);
    } finally {
      restore();
    }
  });

  it('re-arms stored reminders at launch, before the lock is even opened', async () => {
    const restore = onAndroid();
    try {
      const record = await medicine([{ hour: 8, minute: 0 }]);
      // Scheduled by an earlier run; then a force-stop cancels the alarms and
      // keeps the list, which is all the phone has until the app runs again.
      await NotificationsFake.scheduleNotificationAsync({
        identifier: `dose:${record.id}:0800`,
        content: {},
        trigger: { type: 'daily', hour: 8, minute: 0 },
      });
      const schedule = jest.spyOn(NotificationsFake, 'scheduleNotificationAsync');
      biometrics.hangNextPrompt();
      launchApp();
      await screen.findByText(Strings.lock.title.ko);
      await act(async () => undefined);

      expect(schedule).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: `dose:${record.id}:0800` })
      );
    } finally {
      restore();
    }
  });
});

describe('a tapped reminder', () => {
  it('opens its medicine once the app is unlocked', async () => {
    alreadySetUp();
    const record = await medicine([{ hour: 8, minute: 0 }]);
    const first = launchApp();
    await screen.findByText(Strings.home.capture.ko);
    await act(async () => undefined);
    first.unmount();

    // The tap launches the app from closed; it opens behind the lock.
    notifications.tap(`dose:${record.id}:0800`, true);
    launchApp();
    await screen.findByText(R.title.ko);
    expect(screen.getByText('LISINOPRIL')).toBeTruthy();
    expect(notifications.state.lastResponse).toBeNull();
  });
});
