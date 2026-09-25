# label-sweep

The sweep's camera: a viewfinder that reads a medication label from the
camera's analysis stream while the bottle turns, and sends JavaScript only the
recognised lines. The privacy invariant it keeps is in
[`docs/sweep-privacy.md`](../../docs/sweep-privacy.md).

| Platform | State |
| --- | --- |
| Android | `android/` — Kotlin, CameraX 1.6.0 and ML Kit. Compiled, and the whole app assembles with it (local Gradle build); linked. **Not yet run on a device.** |
| iOS | `ios/` — Swift, AVFoundation and Vision. **Written, not compiled, not linked.** |

## Why the Swift is not linked

It cannot be compiled on the Windows machine this project is built on, so it
has never been compiled at all. A Swift file that does not compile, in a linked
module, breaks every iOS build of the app. So `expo-module.config.json` lists
`android` only, and on iOS the app offers the single capture and manual fill-in
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
