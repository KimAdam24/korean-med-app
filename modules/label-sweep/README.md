# label-sweep

The sweep's camera: a viewfinder that reads a medication label from the
camera's analysis stream while the bottle turns, and sends JavaScript only the
recognised lines. The privacy invariant it keeps is in
[`docs/sweep-privacy.md`](../../docs/sweep-privacy.md).

| Platform | State |
| --- | --- |
| Android | `android/` — Kotlin, CameraX 1.6.0 and ML Kit. Compiled, and the whole app assembles with it (local Gradle build); linked. **Not yet run on a device.** |
| iOS | `ios/` — Swift, AVFoundation and Vision. **Compiles; not linked.** |

## Why the Swift is not linked

It cannot be compiled on the Windows machine this project is built on, so it
is compiled on EAS, in an iOS simulator build of the branch
`ios-compile-check`. That branch autolinks the pod for its build only and
registers no module. The first such build (2026-10-05) found one error: inside
the view, a helper named `frame(of:in:)` resolved to the `UIView`'s own
`frame`. Renamed `pixelFrame(of:in:)`, both files compile, with no warnings,
and the app around them builds (2026-10-06). The module has never been
registered or run on iOS.

Until it has run on an iPhone, `expo-module.config.json` lists `android`
only, and on iOS the app offers the single capture and manual fill-in
instead; `sweepAvailable` in `index.ts` is false there.

## Enabling it on iOS

On a Mac with Xcode:

1. Add `"apple"` to `platforms` in `expo-module.config.json`.
2. `npx expo prebuild --platform ios`, then build.
3. Fix whatever does not compile; then check, on a device, that the preview
   shows, lines arrive, a turned bottle completes its directions, and the
   torch works.
4. Make `sweepAvailable` true for iOS in `index.ts`.

What to check in review, beyond compiling: that the frame is read inside the
delegate callback and nothing keeps the pixel buffer (the invariant); that the
orientation (`.right`) matches how the phone is held; and that the session
stops when the view leaves the window.

## Development replay (Android, debug builds only)

Drives the sweep without a working camera, on an emulator: frames come from
files instead, and go through everything after the camera exactly as a live
frame does. The same ML Kit recogniser and line mapping, the same `onLines`
event, and in JavaScript the same accumulation, merge, damage and edge
checks, stall timer and result screen. Frames are taken at the camera's
cadence (one every 300 ms) and scaled to about its analysis size (1920 px on
the long side).

What it does **not** exercise, so still needs a real phone: CameraX binding
and the live analysis stream, focus, exposure and glare, rotation reported by
the sensor, and how many frames a real phone drops while it reads one.

### A replay

A folder of images (read in name order: `frame-001.jpg`, `frame-002.jpg`,
...) or one video (sampled every 300 ms), in the app's own folder on the
emulator:

    /sdcard/Android/data/com.togurt5.koreanmedassistant/files/sweep-replay/<name>

Record the video on any phone: the bottle filling about as much of the frame
as it would in the app, turned slowly all the way round over ten seconds or
so. On an iPhone, set the camera to Most Compatible (H.264); the emulator may
not decode HEVC.

**A real label's video shows the patient's name and address.** Keep it out
of this repository, push it only to the emulator, and delete it from both
when done.

### Running one (PowerShell)

    $dir = '/sdcard/Android/data/com.togurt5.koreanmedassistant/files/sweep-replay'
    adb shell mkdir -p $dir
    adb push vial.mp4 "$dir/vial.mp4"

    # Or a folder of images. A folder adb creates there belongs to adb's own
    # user, which the app may not look inside (it could not on Android 16),
    # so open it up; a video, being one file, needs nothing more.
    adb push frames "$dir/vial"
    adb shell chmod 777 "$dir/vial"

Then, in the app: open the capture screen (약 사진 찍기), press
**DEV: replay a sweep** under the hints, and choose the replay. The button
shows only in a development build, and only when the folder holds a replay;
reopen the capture screen after pushing a new one.

Not a deep link: `adb shell am start` delivers an intent, which pauses the
app, and the lock (rightly) takes a pause for leaving and locks.

    adb logcat -s LabelSweep                   # frame counts and decode problems, no text
    adb shell rm -r "$dir/vial.mp4"            # afterwards

The sweep screen opens at once, with the frame being read on screen and a
yellow `REPLAY (development)` label giving its number. It ends as a live sweep
does: by itself when everything reads whole, on Stop, or 20 seconds after
the last frame that added anything. The merged reading then appears on the
result screen, and a development build logs it once, redacted, as it does
for a live sweep.

### Its frames, for a test

A replay also logs every frame it read, once, when it ends: redacted as
every development log is, between `[sweep-replay] BEGIN` and `END`, one
entry per frame. `replay-log.ts` reads them back (`expand`), so a merge
problem found on the emulator can become a test in `merge.test.ts`.

This cannot happen in a sweep from the camera, whatever is configured.
Frames are kept only while the sweep is a replay, and only frames the native
view marks as read from a replay's file; the camera path marks its own
frames as the camera's, and nothing in JavaScript can change that.

A release build shows no replay button, lists no replays, and its native
view refuses a replay even if asked: it checks that the app is debuggable.
