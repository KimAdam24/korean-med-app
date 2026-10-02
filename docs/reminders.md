# Dose reminders

The standard: **a reminder that fails silently is worse than none.** Someone
told they will be reminded stops remembering for themselves. So the app never
reports "on" from what it asked the phone to do; it reports what the phone
says back, and says so plainly — with the fix beside it — whenever a reminder
will not ring as set.

## What a reminder is

A daily time of day for one medicine: 8:00, on the phone's own clock. Stored on
the medicine's record, in the encrypted vault. The phone's scheduler is given
only an identifier (`dose:<medicine id>:0800`) and a generic "Time for your
medicine" — never a name, because the notification shows on the lock screen and
the scheduler's copy is outside the vault. Tapping it opens the app, which opens
that medicine's page once unlocked.

Wall-clock, deliberately: 8:00 means 8:00 wherever the phone is, on the day it
fires. That is what "take it with breakfast" means, and what every pill-box
alarm does. A medicine that needs strict intervals across a journey is a
question for the pharmacist, not something the app should guess at.

## Requirements, and how each is met

| Requirement | iOS | Android |
| --- | --- | --- |
| Daylight saving | Repeating calendar trigger with no timezone: follows the device's clock | Next firing computed with the zone's rules (`Calendar.add(DATE, 1)` keeps the wall-clock time) |
| Change of timezone | Automatic, as above | **Not handled by expo-notifications**: the alarm is one absolute instant. `modules/dose-alarms` re-arms everything on `TIMEZONE_CHANGED` and `TIME_SET` |
| Reboot | Kept by the OS | expo-notifications re-arms from its stored list on boot |
| App update | Kept by the OS | Re-armed on `MY_PACKAGE_REPLACED` |
| Force-stop | n/a | Alarms cancelled, list kept, nothing re-arms until the app runs. The app re-arms at every launch, before the lock |
| On time | Calendar triggers fire on time | Exact only with "Alarms & reminders", which Android 14 does not grant new installs. Checked (native), reported as "may arrive late", with the button that opens the setting |
| Allowed to show | Full authorisation only; "provisional" is silent and does not count | `POST_NOTIFICATIONS`, asked for with a reason when the first reminder is set |
| Makes a sound | The default sound (`sound: 'default'` in the content); "Sounds" off in Settings is reported as silent | The channel's sound, which is the phone's default because the channel names no sound file (naming 'default' made expo-notifications look for a file of that name and log it missing on every launch); a muted or lowered channel is reported as silent, and one turned off altogether (importance NONE) as blocked. Below Android 8 there are no channels: the notification's own default sound, and the app-wide switch decides |
| Capacity | 64 pending notifications per app; the rest are dropped silently. The app caps all reminder times at 48 | No limit that matters |
| Do Not Disturb | A Focus silences them unless the app is allowed in it, which the app cannot read: reported as "set", with that said, never "on" | The channel's "Override Do Not Disturb", which only the user can turn on: read back, and opened for them, after an explanation, from the warning. Do Not Disturb on now is read too (`NotificationManager.getCurrentInterruptionFilter`) |

Sources: the expo-notifications 57.0.21 source (the Android `DailyTrigger`,
`ExpoSchedulingDelegate`, the receiver's actions; the iOS `DailyTriggerRecord`)
and the Expo SDK 57 documentation. Where a behaviour below says "unverified",
it comes from neither.

## What "on" means

After every change, on every unlock and whenever the app returns to the front,
`syncReminders`:

1. cancels scheduled reminders that no longer match a medicine and time,
   except those of a medicine the vault could not read: its record is still
   on the phone, damaged or from another version, and its reminders are left
   to ring rather than silently cancelled (nothing on screen says so yet);
2. schedules every reminder again — idempotent by identifier, and it re-arms
   anything lost without a trace;
3. reads the schedule back, and calls it **unverified** unless the phone holds
   exactly what it was given;
4. checks notifications are allowed (**blocked** if not);
5. checks they will make a sound, as the phone holds its settings now
   (**silent** if not): on Android the reminders' channel, read back, since
   the user can turn its sound off or lower its importance in Settings and the
   app cannot undo that; on iOS the app's "Sounds" switch. On Android the
   reminders' category can also be turned off on its own while the app's
   notifications stay allowed, which the permission does not show: the
   channel then reads importance NONE, and that is **blocked**, not silent,
   since nothing will appear at all;
6. asks the scheduler itself when the next one fires, and reports that time;
7. checks Do Not Disturb: on Android, whether it is on now, and whether the
   reminders' channel may bypass it (**dnd**, "set" and not "on", if it may
   not; said first if it is on now); on iOS, where neither can be read, always
   **dnd**;
8. on Android, checks exact alarms (**late** if not allowed).

Only if all of that holds does the medicine's page say "Reminders are on. The
next one is at 8:00 AM." Anything else is a warning, spoken to a screen reader
too, on the medicine's page and on the home screen; except that Do Not
Disturb, while it is not on, is said on the medicine's page only, since "your
reminders cannot sound right now" would be untrue on the home screen.

## Do Not Disturb (2026-10-02)

A reminder silenced overnight by a Do Not Disturb schedule leaves no trace:
nothing appears to have failed, and the dose is missed. So the page no longer
says "on" where the phone does not show that Do Not Disturb will let them
through.

- **The app cannot let itself through.** A channel asking to bypass Do Not
  Disturb is overruled by Android (`PreferencesHelper.createNotificationChannel`)
  unless the app has Do Not Disturb access, which would also let it change
  the user's Do Not Disturb; it is not asked for. Only the user can turn on
  "Override Do Not Disturb", on the reminders' own channel page.
- **So it is asked for, explained.** The warning's button explains what the
  switch does and what it leaves alone, and only then opens that page
  (`Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS`, falling back to the app's
  settings). On coming back the channel is read again (`bypassDnd`): "on" only
  once it is really let through.
- **What letting through covers.** "Priority only" Do Not Disturb, which is
  what Android's own settings and schedules set. Not "total silence" or
  "alarms only", which silence everything but alarms: while either is on, the
  page says reminders cannot sound now, and offers nothing, since letting
  through would not help.
- **What is still not seen.** When Do Not Disturb will next turn on, and which
  mode it will be; on Android 15, a mode set to let no apps through, even
  priority ones. Below Android 8, the app-wide override cannot be read: such
  a phone is always "set", with the warning and no button.
- **iOS.** A Focus silences reminders unless the app is allowed in it, and an
  app can read neither. The page says so in place of "on", with no button: no
  app can open the Focus settings. Letting reminders through a Focus by
  default would need them sent as Time Sensitive, with Apple's entitlement for
  it, which is not built and could not be tried here without an iOS build.

## Edge times

- **A time that does not exist** on the day clocks go forward (2:30 in most US
  zones): Android fires it at 3:30, Java's calendar moving it past the gap.
  iOS: unverified.
- **A time that happens twice** when clocks go back (1:30): it fires once
  either way, because a daily trigger fires once per calendar day; which of the
  two 1:30s is platform behaviour, unverified.

## What is still not covered

- **Manufacturer battery managers.** Some phones, Samsung's among them, put
  apps unused for a while into "deep sleep", where their alarms may not run.
  An app cannot detect that from inside; the fix is the phone's own battery
  setting. Worth a line of help text once it is seen to happen.
- **Nothing here has run on a phone.** The Kotlin compiles (a local Gradle
  build of the module and the app's merged manifest), and the JavaScript is
  tested against a fake scheduler. No reminder has yet rung on a device, and the
  iOS side has not been built at all.

## Building it

`expo-notifications` and `modules/dose-alarms` are native: an existing install
needs a new build. Run `npx expo prebuild --platform android` first (not
`--clean`), so the notifications config plugin is applied to `android/`, then
`npx expo run:android`.
