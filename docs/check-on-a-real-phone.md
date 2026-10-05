# To check on a real phone

What the emulator cannot settle. Each item below is the name of a setting on
the phone, quoted in a string the user acts on: if the phone calls it
something else, the user is told to look for a switch that is not there. These
names differ by manufacturer, and by Android version, so they are checked on
the phone the app will be used on, not on a Pixel emulator.

For each: what the phone calls it, in Korean, word for word; and whether the
app's button lands on the page that has it.

| Setting | Where the app quotes it | Check |
| --- | --- | --- |
| **알람 및 리마인더** ("Alarms & reminders", Android 12 and later) | `reminders.statusLate`, `reminders.openAlarmSettings` (both reviewed by her) | With exact alarms off, the reminder warning's button opens the app's own page for it, and the switch there is called 알람 및 리마인더. Turning it on and coming back (the app locks while Settings is open: unlock, and open the medicine's page again) clears "may be late". |
| **방해 금지 모드 무시** ("Override Do Not Disturb"; Samsung's English is "Ignore Do Not Disturb") | `reminders.letThroughExplain` (reviewed by her) | The button under the Do Not Disturb warning, after its explanation, opens the page for the reminders alone (복용 알림), and that page has the switch, under this name. Turning it on, coming back, unlocking and opening the medicine's page again shows 알림이 켜져 있어요. On Android 15, also whether the switch is still on that page at all. |
| **앱 사용 중에만 허용** (the camera question's "While using the app") | `onboarding.cameraBody` (reviewed by her) | On the first launch, the phone's own camera question has a button of exactly that name. |
| **허용** (the notification question's "Allow") | `reminders.askBody` (reviewed by her) | When the first reminder is set, the phone's own notification question has a button of exactly that name. |

Where a name differs, the string changes to match the phone, and goes back on
her sheet (`npm run copy:pending -- --export`), since the wording is hers to
approve.
