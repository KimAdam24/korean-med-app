package expo.modules.dosealarms

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What expo-notifications does not tell JavaScript about Android's alarms.
 *
 * It schedules exact alarms when the app may, and silently falls back to
 * inexact ones when it may not — which on a phone in Doze can mean a reminder
 * arriving long after the dose was due. Whether the app may is a setting the
 * user controls ("Alarms & reminders"), off by default for new installs on
 * Android 14. Nothing in expo-notifications' JavaScript API exposes it, so the
 * reminder screens could not say "your reminders may be late" without this.
 *
 * Nor does it expose Do Not Disturb: whether it is on now, or the one place a
 * user can let these reminders through it (the reminders' own channel page).
 */
class DoseAlarmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DoseAlarms")

    /** Always true below Android 12, where exact alarms need no permission. */
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function true
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.canScheduleExactAlarms()
    }

    /**
     * Opens this app's "Alarms & reminders" setting. Returns false where there
     * is no such setting (below Android 12) or the screen could not be opened.
     */
    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function false
      val intent = Intent(
        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
        Uri.parse("package:${context.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    /**
     * The Do Not Disturb filter in force now, as NotificationManager gives it:
     * 1 all, 2 priority only, 3 none, 4 alarms only, 0 unknown. Needs no
     * permission. Only now: when Do Not Disturb will next turn on (a bedtime
     * schedule, say) cannot be read without access to change Do Not Disturb
     * itself, which this app does not ask for.
     */
    Function("interruptionFilter") {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.currentInterruptionFilter
    }

    /**
     * Opens one notification channel's own settings page, where its "Override
     * Do Not Disturb" switch is. The app cannot set that switch itself: Android
     * ignores a channel's own request to bypass Do Not Disturb unless the app
     * has Do Not Disturb access. False below Android 8, which has no channels,
     * or where the page could not be opened.
     */
    Function("openChannelSettings") { channelId: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }
}
