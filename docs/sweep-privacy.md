# The sweep: what it keeps, and for how long

**Status:** approved 2026-09-25, and revised the same day before any code, by
the shutter precondition: frames now come from the camera's analysis stream,
not from repeated photographs. The invariant below is the revised one, and it
is stronger than the approved one.

**Built** 2026-09-25: the Android view is compiled and the whole app
assembles with it, but it has **not yet run on a device**; the iOS view is
written, not compiled and not linked (below). The screen is
`src/features/ocr/sweep/sweep-reader.tsx`, the merge `sweep/merge.ts`.

The sweep reads the label repeatedly while the user slowly turns the bottle,
keeping what each reading adds, until every line reads complete. That breaks
the shape of today's guarantee — one photograph, bounded lifetime, deleted in a
`finally` — because accumulating across frames is the whole point. This is
what replaces it, stated as what is true rather than what would be nice.

## Today, for comparison

`withTransientCapture`: the camera writes one JPEG to the app's cache, the
caller's recogniser reads it inside a callback, and a `finally` deletes it
whatever happened; a failure to delete wins over the reading. What survives is
the recognised text and its geometry. (Its comment says expo-camera "has no
in-memory capture path on native"; SDK 57 has `pictureRef`, but see below for
why the sweep does not use it.)

## Why not repeated photographs

The approved design took repeated in-memory photographs (`pictureRef`). Every
photograph is a shutter event, and a shutter cannot always be silenced: on
iPhones sold in Korea (and Japan) iOS plays it for every photo capture and no
app can turn it off, and Galaxy phones sold in Korea play it too, as far as can
be established without one in hand. A sweep would click several times a
second. `shutterSound: false` does not help where the sound is enforced.

What no phone treats as a photograph is the camera's **analysis stream**: the
frames it delivers continuously for live processing, as expo-camera's own
barcode scanner uses. It is silent on every phone, in every market. expo-camera
exposes no frame processor, so the sweep has its own small native camera view.

## How the sweep gets frames

`LabelSweepView`, a native view in `modules/label-sweep`:

- **Android (Kotlin):** CameraX `Preview` for the viewfinder and `ImageAnalysis`
  for frames, the same CameraX (1.6.0) expo-camera ships; ML Kit text
  recognition, the same model the single capture uses, run on each analysed
  frame inside native code.
- **iOS (Swift):** `AVCaptureSession` with an `AVCaptureVideoDataOutput`; Vision
  text recognition, the same request the single capture uses, on each frame.

It reads about three frames a second, which is plenty for a bottle turned by
hand, and sends JavaScript one event per frame read: the lines. The viewfinder
and the sweep never run at the same time as expo-camera's preview; the screen
switches between them.

## The invariant

> **Frames never leave native code, and no frame is ever written anywhere.**
> The analyser holds at most one frame at a time — CameraX's
> keep-only-latest backpressure on Android, a video output that discards late
> frames on iOS, and a frame is dropped unread while another is being read —
> and each is released as soon as its own recognition completes, before the
> next is taken. **What crosses into JavaScript is only what the recogniser
> returned**: each line's text, confidence and position, and the frame's size.
> That, and the merge's bookkeeping derived from it, is everything the sweep
> holds. It lives in memory in the capture screen and is gone when the screen
> is.

It is structural, not a matter of care. The JavaScript side cannot receive a
frame: the view's only event carries lines. The code that accumulates lines
imports nothing from the camera or capture code — asserted by a boundary test,
as `content-drafts` is — so there is no type through which a frame could reach
it even if one were sent.

## Is any image data held between frames?

- **By this app: no.** No frame reaches JavaScript, and native code releases
  each when its recognition completes. Nothing derived from pixels is kept —
  no crop, no thumbnail, no brightness figure.
- **By the camera pipeline: yes, as today.** While the viewfinder is open the
  OS camera stack streams frames through its own buffers — a small, recycled
  pool — to draw the preview and to feed the analyser. That is what happens on
  today's capture screen too, for as long as it is open.
- **By the engines: not knowable, and that is the honest answer.** ML Kit and
  Apple Vision run on the device, and neither API returns or exposes anything
  that holds the image after the call completes. Whether they cache internally
  cannot be inspected from here. That is equally true of today's single
  capture; the sweep runs the same engines on more frames, not different ones.

## What accumulates, exactly

Per frame: for each line the engine returned, its text, confidence, frame and
corners (numbers in that frame's pixels), the frame's size, and which frame it
came from. Across frames: the merged set of lines, each with its best reading
and why it was chosen. **Text and geometry only.** The text includes the
patient's name and address, exactly as a single reading's does today.

## When it is discarded

- **Leaving the capture screen**, by any route — the state lives in the screen,
  and the native view stops its camera when it is removed.
- **The app going to the background.** The native view's camera is bound to
  the activity's lifecycle and stops; the lock replaces the navigator, which
  unmounts the screen; and the sweep drops its state on the `background`
  event itself, so it does not depend on either.
- **A completed read.** The per-frame history is dropped and only the merged
  lines go to the result, as a single reading's lines do today.
- **Cancel**, which goes back to the photograph's reading and keeps nothing
  the sweep read.
- **A sweep that stalls**: nothing newly read for 20 seconds. The camera
  stops, and what was read goes to the result, as when the user stops it,
  with a line saying why the screen changed by itself.

Nothing reaches the vault until the user saves, as today.

## When it is offered

Only under the curve notice: after a photograph whose lines ran off a label
judged curved, by the same under-triggering rule as the notice. A line cut at
the edge of a label not judged curved is withheld and told to retake, not to
turn the bottle. Where a merged reading still has cut lines, they are withheld
on their text alone (a line ending mid-word), but a curve is still said only
where the edge check finds one; text alone is not a diagnosis.

What the sweep cannot recover can be filled in by hand
(`src/features/ocr/fill-in.ts`): the user types only the broken or missing
words, from the bottle, into boxes in the line; the result is read again by
the whole pipeline and shown back for confirmation. Offered only for a field
the reading found and withheld, with a specific gap in it.

## Development replay

Debug builds can replay a sweep from files instead of the camera
(`modules/label-sweep/README.md`), so the merge can be exercised on an
emulator. It reads only from the app's own `sweep-replay` folder, where a
developer put the files by hand, and writes nothing. It cannot run in a
release build: JavaScript offers and passes a replay only in development,
and the native view refuses one unless the app is debuggable. The invariant
is unchanged for it: its frames, too, stay in native code, and only lines
cross. The files themselves are test material, and a real label's are
private: they stay off the repository and are deleted after use.

A replay, and only a replay, logs the lines of every frame it read, once at
its end and redacted, so a merge problem can become a test. That is not a
switch that a real sweep could have turned on: lines are kept only from
frames the native view marks as read from a replay's file, and the camera
path marks its frames as the camera's. A sweep from the camera logs its
merged reading once, as before, and nothing else.

## Logging

Development builds log a reading once, with anything not evidently label
text redacted in shape (`log-redaction`). The sweep logs its final merged
reading only, never a frame.

## Does it need new copy?

- "Photos are not saved" (`camera.privacyBanner`) stays true — more literally
  than today, since the sweep takes no photograph at all.
- The home screen's "deleted right after the text is read" is under rewrite in
  `content-drafts/privacy-copy.draft.md`, whose guarantee — *the image is never
  kept and never sent; only the words on it are used* — describes the sweep
  exactly.
- The sweep needs its own instructions, progress, a stall message, and one
  plain privacy line for a screen where the camera is visibly reading all the
  time. All marked for the translation batch; none written in Korean.

## Is it as private as the single capture?

**Yes, and more so**: no frame is ever a file, and no pixel ever reaches
JavaScript. It is more exposure of the same kind in two ways — many frames pass
through the engines instead of one, and the extracted text is held for the
length of the sweep — but neither is a new kind of data, and neither leaves the
device.

## What it costs, and the Swift

Native code on both platforms: a camera view each, the recognition reused from
`LabelOcr`. **The Swift half is written but not linked.** It cannot be compiled
here (there is no Xcode on Windows), so it is not even compile-verified, and an
uncompiled Swift file in a linked module would break every iOS build. The
module's `expo-module.config.json` lists Android only; on iOS the app offers
the single capture and manual fill-in instead. Linking it is one line — add
`"apple"` to `platforms` — once a Mac has compiled it.

Single captures are unchanged: pressing the shutter takes one photograph, and
one click is what a user expects from it.
