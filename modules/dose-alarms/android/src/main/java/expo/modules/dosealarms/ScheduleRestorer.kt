package expo.modules.dosealarms

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.notifications.service.delegates.ExpoSchedulingDelegate
import kotlin.concurrent.thread

/**
 * Re-arms every scheduled notification when the phone's clock or timezone
 * changes, or when the exact-alarm permission is granted.
 *
 * Why this exists: a daily reminder at 8:00 is stored by expo-notifications as
 * "8:00", but armed with Android's AlarmManager as one absolute instant — the
 * next 8:00 in the timezone the phone was in when it was armed. Daylight saving
 * is fine, because that instant is worked out with the zone's rules. Moving
 * zones is not: flown from New York to Seoul, the phone keeps its instant for
 * 8:00 in New York and wakes the user at 9 pm, and only then works out the next
 * one in Seoul time. expo-notifications re-arms after a reboot and an app
 * update, but listens for nothing else.
 *
 * So on a timezone or clock change this calls the same routine its reboot
 * handler calls, which recomputes the next occurrence of every stored trigger
 * in the phone's current zone. The permission broadcast is here too: alarms
 * armed while exact alarms were not allowed were armed inexact, and granting
 * the permission does not upgrade them.
 */
class ScheduleRestorer : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_TIME_CHANGED,
      AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> {
        // Reads SharedPreferences and talks to AlarmManager: not on the main
        // thread, and not after onReceive returns without goAsync().
        val pending = goAsync()
        val appContext = context.applicationContext
        thread {
          try {
            ExpoSchedulingDelegate(appContext).setupScheduledNotifications()
          } catch (e: Exception) {
            // Logged, not rethrown: a crash here would take the app's process
            // down in the background. The app re-arms on its next launch.
            Log.e("DoseAlarms", "Could not re-arm reminders after ${intent.action}", e)
          } finally {
            pending.finish()
          }
        }
      }
    }
  }
}
