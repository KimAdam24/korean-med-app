import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { loadProfile, unreadableMedicationIds } from '@/features/medications/medication-store';
import { EMPTY_PROFILE } from '@/features/medications/types';

import { medicationFromResponse, syncReminders, type ReminderHealth } from './scheduler';

type RemindersValue = {
  /** `null` until the first check has answered. */
  readonly health: ReminderHealth | null;
  /** Re-syncs with the profile as stored; call after changing any reminder or medicine. */
  readonly resync: () => Promise<ReminderHealth>;
};

const RemindersContext = createContext<RemindersValue | null>(null);

/**
 * Keeps the phone's reminder schedule matched to the profile, and knows
 * whether it is.
 *
 * Mounted inside the unlocked app only, because matching needs the profile,
 * which is encrypted. It syncs when it mounts — that is, on every unlock — and
 * each time the app comes back to the front, which is when a permission the
 * user changed in the phone's settings takes effect. Syncs run one at a time:
 * two interleaved would cancel and schedule over each other.
 *
 * It also opens the medicine a tapped reminder was for. The tap may have
 * launched the app behind the lock, so it is picked up here, after unlocking,
 * rather than where it arrived.
 */
export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [health, setHealth] = useState<ReminderHealth | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const resync = useCallback(() => {
    const run = queue.current.then(async (): Promise<ReminderHealth> => {
      try {
        const loaded = await loadProfile();
        // An unreadable profile says nothing about which reminders should
        // exist, so the schedule is left exactly as it is — and not called on.
        if (loaded.status === 'unrecoverable') return { kind: 'unverified' };
        return await syncReminders(
          loaded.status === 'ok' ? loaded.value : EMPTY_PROFILE,
          loaded.status === 'ok' ? await unreadableMedicationIds() : []
        );
      } catch {
        return { kind: 'unverified' };
      }
    });
    queue.current = run;
    return run.then((next) => {
      setHealth(next);
      return next;
    });
  }, []);

  useEffect(() => {
    void resync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resync();
    });
    return () => subscription.remove();
  }, [resync]);

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const medicationId = medicationFromResponse(response);
      if (!medicationId) return;
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      router.push(`/medication/${medicationId}`);
    };
    void Notifications.getLastNotificationResponseAsync().then(open, () => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [router]);

  const value = useMemo(() => ({ health, resync }), [health, resync]);
  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders(): RemindersValue {
  const value = useContext(RemindersContext);
  if (!value) throw new Error('useReminders must be used inside a RemindersProvider.');
  return value;
}
