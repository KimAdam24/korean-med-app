# The release build

**First built 2026-09-28.** A local Android release build, two ways: as the
project is configured (no minification), and with R8 minification on. Both
build, and both pass `scripts/check-release.py`. Neither has been installed
and run yet: that is the checklist below.

## Building

From `android/` (the generated project; `npx expo prebuild` makes it):

    ./gradlew.bat app:assembleRelease
    ./gradlew.bat app:assembleRelease -Pandroid.enableMinifyInReleaseBuilds=true

The APK is `android/app/build/outputs/apk/release/app-release.apk`; with R8,
its mapping is `android/app/build/outputs/mapping/release/mapping.txt`.

Two things about this build that a store build must change (held, as asked,
until the rest lands):

- **Signed with the debug key.** `android/app/build.gradle` signs release with
  `debug.keystore`. Fine for installing on the emulator; the Play Store needs
  a real upload key.
- **R8 is off by default** (`android.enableMinifyInReleaseBuilds` is false),
  so a plain release build never exercises minification. It was built with R8
  on as well, to check the risk flagged earlier, and passes (below).

The APK is about 120 MB because it carries all four CPU architectures; a
store bundle (AAB) splits them.

## What has been checked, and how

Without installing anything, from the APK itself (`scripts/check-release.py`):

| Check | Default | R8 |
| --- | --- | --- |
| Manifest not debuggable, so the sweep replay refuses to run | pass | pass |
| Every development-only screen, panel and log compiled out of the bundle ([dev-only-paths.md](dev-only-paths.md)) | pass | pass |
| Shipped copy found in the bundle, so the search above works | pass | pass |
| The app's own native classes present: `LabelOcrModule`, `LabelSweepModule`, `LabelSweepView` (and its `(Context, AppContext)` constructor, which Expo calls by reflection), `DoseAlarmsModule`, `ScheduleRestorer` | pass | pass |
| Expo still finds its generated module list after R8 | n/a | pass |

The last is the one that could have broken everything. Expo looks up
`expo.modules.ExpoModulesPackageList` with `Class.forName` and then
`getMethod("getPackageList")`, and its shrinker rule keeps the method but not
the class name; R8 renamed the class (to `ha.d`). It still works because R8
also turned the constant `Class.forName(...)` into a direct reference to the
renamed class (`const-class`), and kept `getPackageList` by name, both
confirmed in the disassembly. R8 reported no missing classes.

Also found, not changed (decisions):

- **`android:allowBackup="true"`.** Android may copy the app's data into the
  phone's backup. The vault is encrypted and its key never leaves the phone,
  so a backup holds unreadable ciphertext, and a restore brings back a vault
  that cannot be opened (the README's "profile does not survive a change of
  device"). Setting `"allowBackup": false` under `android` in `app.json` keeps
  the data on the phone entirely.
- **The app's name on the phone is `korean-med-assistant`**, in every
  language: `app.json`'s `name`. `"name": "약 도우미"` (the reviewed name) and
  a prebuild would fix it.

## Checking it on the emulator

Installing the release APK replaces the development build (same package, same
key), keeping the app's data. `npx expo run:android` puts the development
build back.

    adb install -r android/app/build/outputs/apk/release/app-release.apk
    adb logcat -c

Then, in order:

1. **It opens as the app**, not the development launcher: the lock screen (or,
   on a fresh install, the introduction).
2. **Unlock with your PIN.** Secure storage and the phone lock work.
3. **Home has the gallery picker and no file probe.** "Choose a photo from
   your phone" opens the phone's photos: the gallery ships in release since
   2026-09-28, with its label and the privacy line under it in English until
   the `privacy.*` strings are signed off. The file probe at the bottom of a
   development build is tooling, and must not be there.
4. **The camera opens**, with no yellow "DEV: replay a sweep" button. Press the
   shutter: the emulator's synthetic frame goes through the OCR module. "We
   could not read the writing", or a reading, both mean the module loaded and
   ran. "Label reading is not connected yet", or a crash, would mean it did
   not.
5. **A reminder**: on a medicine's page, add a time two minutes ahead. "Reminders
   are on" means the reminder module answered; then wait for it to ring.
6. **The log**, afterwards:

        adb logcat -d | grep -E "label-ocr|sweep-replay|Couldn't get expo package list"

   should print nothing: no reading is logged in release, and Expo found its
   modules.

A real label can be read on the emulator in release now, from a photo in its
gallery (push one with `adb push`, then "Choose a photo from your phone"), and
its approved uses need only the emulator's network. What still needs a real
camera, and so the release APK on a phone: barcode scanning, and the camera's
own capture of a label. The curve notice, fill-in and the sweep are hidden in
this version (`docs/scope.md`); the sweep's native view is still in the APK
(above) but is never mounted.
