# The sweep: what it keeps, and for how long

**Status:** design, for decision before any code. Written 2026-09-25.

The sweep reads the label repeatedly while the user slowly turns the bottle,
keeping what each reading adds, until every line reads complete. That breaks
the shape of today's guarantee — one photograph, bounded lifetime, deleted in a
`finally` — because accumulating across frames is the whole point. This is
what replaces it, stated as what is true rather than what would be nice.

## Today, for comparison

`withTransientCapture`: the camera writes one JPEG to the app's cache, the
caller's recogniser reads it inside a callback, and a `finally` deletes it
whatever happened; a failure to delete wins over the reading. The caller only
ever sees a URI that is dead when its callback returns. What survives is the
recognised text and its geometry.

One thing in that file's own explanation is out of date: it says expo-camera
"has no in-memory capture path on native". SDK 57 has one — `pictureRef` —
and it changes the answer below.

## How a sweep can get frames at all

expo-camera 57 has **no frame processor** and no live-frame callback; the only
live-frame analysis it does is its own barcode scanning. So there are exactly
three ways, established from its documentation and native source:

1. **Repeated file captures**: today's `withTransientCapture`, in a loop.
2. **Repeated in-memory captures**: `takePictureAsync({ pictureRef: true })`.
   On both platforms this returns the picture as an in-memory image reference
   and **does not write a file** (Android: `ResolveTakenPicture` resolves a
   `PictureRef` before the write; iOS: `CameraPhotoCapture` builds a `UIImage`
   and returns before `generatePathInCache`).
3. **A frame-processor camera** (react-native-vision-camera or similar), with
   native recognition plugins on both platforms.

Recommended: **2**, with **1** as the fallback. Option 3 means a second camera
library on the capture screen and plugins in Swift that cannot be tested here;
it buys a higher frame rate, which a slow hand-turned sweep does not need.

## The invariant

With option 2:

> **At most one frame exists at any moment, and it is never a file.** Each is
> an in-memory image reference, released in a `finally` as soon as its own
> recognition call returns, before the next is taken. **Between frames, only
> what the recogniser returned persists** — each line's text, its confidence
> and its position in that frame — plus the merge's bookkeeping, which is
> derived from those and nothing else. It is all held in memory by the capture
> screen, never written anywhere, and is gone when the screen is.

With option 1 the first sentence becomes "at most one frame exists at any
moment, as a file in the app's cache, deleted in a `finally` before the next is
taken" — today's guarantee, per frame. A crash mid-sweep can leave that one
file; the launch-time cache sweep already removes it.

It is kept structural, as today's is, rather than by care: the frame loop is
the only code that touches a frame, and it hands the accumulator
`RecognizedTextLine[]` and nothing else. The accumulator module must not import
anything from `features/capture` or `expo-camera` — asserted by a boundary
test, as `content-drafts` is — so there is no type through which a frame could
reach it.

## Is any image data held between frames?

- **By this app: no.** The reference is released before the next frame is
  taken, and nothing derived from pixels is kept — no crop, no thumbnail, no
  brightness figure.
- **By the camera pipeline: yes, as today.** While the capture screen is open
  the OS streams preview frames through its camera service and GPU buffers to
  draw the viewfinder and to scan barcodes. That already happens on today's
  screen, for as long as it is open; the sweep does not change it.
- **By the engines: not knowable, and that is the honest answer.** ML Kit
  (Google Play Services text recognition) and Apple Vision both run on the
  device, and neither API returns or exposes anything that holds the image
  after the call completes. Whether they cache internally cannot be inspected
  from here. That is equally true of today's single capture — the sweep runs
  the same engines on more frames, not different ones.
- **The picture reference itself** holds native bitmap memory until released;
  left to the garbage collector it could outlive its call by seconds. The
  design releases it explicitly, and a test can hold that the loop always does.

## What accumulates, exactly

Per frame: for each line the engine returned, its text, confidence, frame and
corners (numbers in that frame's pixels), and which frame it came from. Across
frames: the merged set of lines, each with its best reading and why it was
chosen. **Text and geometry only.** The text includes the patient's name and
address, exactly as a single reading's does today.

## When it is discarded

- **Leaving the capture screen**, by any route — the state lives in the screen.
- **The app going to the background.** The lock replaces the whole navigator
  when the app leaves, which unmounts the screen and everything in it; the
  sweep also stops and drops its state on the `background` event itself, so it
  does not depend on the lock to do so.
- **A completed read.** The per-frame history is dropped and only the merged
  lines go to the result, exactly as a single reading's lines do today; after
  that, nothing distinguishes it from a one-photo read.
- **Retake or restart**, and **a sweep that stalls** (no new line completed for
  a set time), which stops the camera and asks the user to start again.

Nothing reaches the vault until the user saves, as today.

## One exception to fix first: development builds

Development builds print every reading — text, name and address included — to
the device log (`logRecognizedLines`); that is how the retaken vial reached the
corpus. It is compiled out of release builds, but on a development phone that
text sits in the system log until it rotates. A sweep must not log each frame:
at most the final reading, as today, and the header of `dev-line-list` should
say that the log is a copy outside the app.

## Does it need new copy?

- "Photos are not saved" (`camera.privacyBanner`) stays true — with option 2,
  more literally than today, since no frame is ever a file.
- The home screen's "deleted right after the text is read" is under rewrite in
  `content-drafts/privacy-copy.draft.md`, whose guarantee — *the image is never
  kept and never sent; only the words on it are used* — describes the sweep
  exactly. That wording is the one to prefer.
- The sweep needs its own instructions ("turn the bottle slowly…"), progress
  and a stall message, and one plain privacy line for a screen where the
  camera is visibly reading continuously: *"The camera reads the label as you
  turn it. It keeps only the words, never a picture."* All marked for the
  batch; none written in Korean.

## Is it as private as the single capture?

**Yes, with option 2 — and in one respect more so**: no frame is ever written
to storage, where today one file exists for the length of a read. In two
respects it is more exposure of the same kind: many frames pass through the
engines instead of one, and the extracted text is held for the length of the
sweep instead of one read. Neither is a new kind of data, and neither leaves
the device. With option 1 it is today's guarantee, repeated.

Nothing here trades the guarantee away. If option 2's native work does not
come together, option 1 is the fallback, not something weaker.

## What option 2 costs

**Native code, both platforms**: `LabelOcr` today takes a file URI. It would
need an entry point taking the picture reference — Kotlin
(`InputImage.fromBitmap` on the `SharedRef<Bitmap>`) and **Swift** (a
`CGImage` from the `SharedRef<UIImage>`). The Swift half would be
compile-verified only.

## Also to settle before building

**The shutter.** Repeated captures play the shutter sound unless
`shutterSound: false` is passed (expo-camera plays it itself, on Android with
`MediaActionSound`). Phones made for the Korean market sound it regardless — an
industry standard there since 2004 — so if the phone it runs on was bought in Korea, a
sweep could click several times a second. Worth one test capture on that phone
before the sweep is designed around repeated captures at all.
