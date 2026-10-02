import { requireOptionalNativeModule } from 'expo';

/**
 * Android's exact-alarm permission and Do Not Disturb, which expo-notifications
 * does not expose.
 * See `android/.../DoseAlarmsModule.kt`.
 *
 * `null` on iOS and web, where there is no such permission — iOS delivers a
 * calendar notification on time without asking — and on an Android build made
 * before this module existed, which the reminder code treats as "cannot say".
 */
type DoseAlarmsModule = {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): boolean;
  /**
   * Do Not Disturb now: 1 all, 2 priority only, 3 none, 4 alarms only, 0
   * unknown. Missing on a build made before it was added.
   */
  interruptionFilter?(): number;
  /** Opens a notification channel's own settings page. Missing on older builds. */
  openChannelSettings?(channelId: string): boolean;
};

export const DoseAlarms = requireOptionalNativeModule<DoseAlarmsModule>('DoseAlarms');
