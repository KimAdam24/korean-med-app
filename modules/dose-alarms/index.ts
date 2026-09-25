import { requireOptionalNativeModule } from 'expo';

/**
 * Android's exact-alarm permission, which expo-notifications does not expose.
 * See `android/.../DoseAlarmsModule.kt`.
 *
 * `null` on iOS and web, where there is no such permission — iOS delivers a
 * calendar notification on time without asking — and on an Android build made
 * before this module existed, which the reminder code treats as "cannot say".
 */
type DoseAlarmsModule = {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): boolean;
};

export const DoseAlarms = requireOptionalNativeModule<DoseAlarmsModule>('DoseAlarms');
