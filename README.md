# 약 도우미 / Korean Medication Assistant

A phone app for elderly users who take several prescriptions and are more
comfortable reading Korean. It reads a medication label through the camera,
explains it in Korean, and keeps a medication profile on the device.

Two rules shape most of the design decisions in this repo:

- **Photographs are never stored.** An image exists only long enough to be read,
  and the capture path deletes it before returning — and refuses to hand back
  pixels it could not delete. See `src/features/capture/transient-capture.ts`.
  A photo chosen from the gallery arrives as the picker's copy in the app's
  cache, never the user's original, and that copy is deleted the same way. Both
  caches are emptied at every launch, for a run that died mid-read. See
  `src/features/capture/photo-caches.ts`.
- **The profile is the user's alone.** Medication records are encrypted at rest
  under a key that never leaves this device's keychain. See
  `src/features/security/`.

## Running it

These are native modules (camera, keychain, biometrics), so **Expo Go will not
work** — the app needs a development build.

Node 22.13 or later is required (React Native 0.86's floor). EAS builds use
22.23.1, pinned in `eas.json` and `.nvmrc`; use the same locally so the lock
file is written by the npm that will install it.

```bash
npm install

# One-time per device: build and install a dev client.
npx expo run:android      # or: npx expo run:ios
```

After the dev build is installed, `npx expo start` reloads JS against it as
usual.

```bash
npm run typecheck   # app and tests
npm run test:unit   # pure-logic tests, run on Node
npm run test:integration   # the app end to end under Jest, native modules faked
npm run eval        # OCR scorecard against real label readings
npm run smoke:android -- --dev-server http://10.0.2.2:8081   # launch a real build, fail on a crash
npm run lint
```

## Layout

```
src/app/                  screens (expo-router)
src/features/capture/     transient photo capture (§3.1)
src/features/ocr/         label-recognition seam (§3.1)
src/features/security/    app lock and encrypted vault (§3.3)
src/features/medications/ the medication profile (§3.3)
src/i18n/strings.ts       all user-facing copy, Korean-first
```

## What is built

| Area                                    | State                                             |
| --------------------------------------- | ------------------------------------------------- |
| Camera capture, photo discarded         | Built                                             |
| Barcode identification, NDC → RxNorm    | Built — the primary path (§3.1)                   |
| OCR label reading (§3.1 fallback)       | Custom native module — not yet verified on device  |
| App lock, biometric + PIN (§3.3)        | Built                                             |
| Encrypted medication storage (§3.3)     | Built                                             |
| Korean translation (§3.2)               | Decided, not built                                |
| Interaction guidance (§3.4)             | Not started, by choice — needs authoritative data |

Identification is US-first: NDC codes resolved against RxNorm. Korean products
(식약처/KIMS) are not handled yet, and the Korean OCR script model is
deliberately not bundled — see the limitations below.

## Known limitations

Things that are understood and accepted, not oversights. Revisit before release.

### The medication profile does not survive a change of device

The vault key is stored with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it never
travels in an encrypted backup. Restoring onto a new phone leaves the saved
records unreadable and the user has to re-scan their medicines.

This is deliberate and follows the privacy requirement that the data be
accessible only to the user — a key that rides a backup makes "the user" mean
"whoever restored it". The app detects this case and says the data cannot be
opened, rather than presenting an empty list as though nothing was saved.

The cost is real: a phone upgrade costs a re-scan, for the users least likely to
enjoy doing one. If that turns out to hurt in practice, the fix is a deliberate,
user-initiated export — not loosening the keychain accessibility flag.

### A lookup tells NLM which medicine was scanned

Resolving an NDC means asking RxNav (National Library of Medicine) over the
network. One NDC goes out per scan, over HTTPS, with no user or device
identifier, no account, no cookie, and nothing from the medication profile — but
NLM can still see that some IP address looked up a particular drug.

This was the cheaper of the two disclosures available. Cloud OCR would have sent
the photograph itself; barcode-first sends eleven digits. If even that is
unacceptable, the alternative is bundling an offline copy of the NDC directory,
which is large but not impossible.

### Label reading is heuristic, and measured against very few labels

`modules/label-ocr` is a local Expo module: Apple Vision on iOS, ML Kit via Play
Services on Android, both entirely on-device. It returns ordered lines of text.

`sig-parser` picks the name, strength and directions out of those lines by
content, and `field-integrity` decides whether each can be shown as a value or
only as damaged text. Both are heuristics. The rule they are built to keep is
that a field is either right or visibly withheld — never shown clean and wrong
— and `src/features/ocr/eval` measures exactly that against real readings:
`npm run eval` prints the scorecard, and the unit tests fail on any field shown
as a value that is not what the label says.

The corpus behind that is tiny: one stock template and one real vial. Until it
holds ten to twenty real labels, photographed the way users will photograph
them, a clean scorecard means little. Photographs are never added — only the
engine's lines, redacted in shape; the corpus header says how.

Reading order is decided in TypeScript (`reading-order.ts`) from the geometry
both native modules return, following each line's slope so that the pieces of
a printed line bent round a vial stay on one row. It is tested on synthetic
geometry only: neither corpus label was captured with geometry, so how it
behaves on a real curved bottle is not yet known.

We wrote this rather than taking a dependency because no community OCR library
is both maintained and current: `expo-text-extractor`'s last substantive commit
was ~4 months before we looked and it has no SDK 56/57 support, Infinite Red's
text-recognition package is pinned two majors behind its own core, and
`react-native-ml-kit` had not been pushed in over a year. On iOS, Vision is part
of the OS, so the dependency count there is zero.

Only Latin script is bundled. ML Kit ships one model per script at roughly 38 MB
each, and these users read English labels — Korean is the language of the
guidance, not of the input.

### OCR confidence is not comparable across platforms

Both engines report a 0–1 confidence per line — Vision's top candidate on iOS,
`Text.Line.getConfidence()` on Android. The Android module sent `null` for
every line until this was caught, on the mistaken belief that ML Kit exposed
none; it does, in the API reference.

The two numbers come from different models and mean different things, so no
threshold should be shared between them. Nothing currently gates on
confidence: every OCR field is capped below the confirmation threshold
regardless, because a perfectly recognised line can still be the wrong line.

### The native module has not been run on hardware

The Kotlin compiles, including the change that returns line geometry
(verified with a local Gradle build of the module). The Swift compiled before
that change, in an EAS iOS simulator build; the geometry version has not been
compiled yet. Android has read a real dispensed label, from a photograph on an
emulator. Neither platform has read one through the camera of a physical
device.

### A scanned barcode cannot say which NDC segmentation it holds

A 10-digit NDC is printed as 4-4-2, 5-3-2 or 5-4-1, and the barcode omits the
hyphens that would say which. Each scan therefore yields up to three candidate
11-digit codes, and RxNorm is asked about all of them. Usually exactly one
exists. When more than one does, the app asks the user rather than picking —
`src/features/drugs/ndc.ts` explains why at length.

### Screenshots are blocked on Android

The app switcher must not show what the lock hides, so the app blurs itself in
the iOS switcher and sets `FLAG_SECURE` on Android (`screen-privacy.ts`).
Android has no way to blank the recents thumbnail without also blocking
screenshots and screen recording, so on Android a caregiver cannot screenshot
the medicine list to share it. iOS screenshots still work. This needs a
native rebuild to take effect; older builds run unprotected rather than crash.

The library needs `DETECT_SCREEN_CAPTURE` just to load: on Android 14+ it
registers a screen-capture callback as it starts, and Android throws without
the permission. A build that blocked it crashed at launch; the permission is
normal-level, granted at install, and asks nothing of the user.
`integration/android-permissions.test.ts` now checks every removed permission
against the native code that ships, and `npm run smoke:android` launches a
real build to catch what no JavaScript test can see.

The smoke check passes only when the app draws one of its own first screens
(lock, PIN, fingerprint prompt, or home) and stays up; a live process on a
blank screen is a failure. For a dev build it checks the dev server answers
first — on the emulator that is `http://10.0.2.2:<port>`. It was proven on the
Pixel 7 emulator both ways: the good build passes, and a build with
`DETECT_SCREEN_CAPTURE` stripped fails on the exact permission-denial crash.
If a dev build hangs on a blank screen, the dev server is usually the cause:
restart it, and force-stop the app before retrying.

### The PIN lockout can be shortened by changing the device clock

The lockout schedule reads `Date.now()`. Defeating it requires already holding
an unlocked phone, at which point the PIN is not what protects the data — the
hardware-backed key is. Accepted knowingly; see `src/features/security/pin.ts`.

### An integration run failed once, and the failure was never identified

**Open.** On 2026-09-24 one run of `npm test` failed two integration tests in
two suites (58 total). They were not identified: the console output had been
filtered, and Jest's record of failing files was lost when its cache was
cleared while investigating. It has not recurred since.

Ruled out, each by rerunning the suite with Jest's old one-second wait
restored: slow first renders (the two slowest tests, one per app-level suite,
take 700–770 ms; no run failed), all 16 cores saturated (three runs, none
failed), and a cold cache (none failed). The five-second wait in
`integration/reset.ts` is a precaution for the closest case, not a fix.

`integration/failure-log-reporter.js` now appends every failure — test, suite,
duration, the first lines of the error, CPU use during the run — to
`.test-results/failures.log`, whatever happens to the console. If this recurs,
that file names it.

### What the tests cannot reach

Two layers of automated tests. `npm run test:unit` covers the pure logic — the
label parser, field integrity, reading order, the evaluation corpus, the UTF-8
codec — on Node. `npm run test:integration` (Jest, in `integration/`) runs the
real app above the native boundary: the vault with real AES-GCM, the PIN store
and its lockout, the lock and relock behaviour, the capture path's deletion
guarantee, and the screens end to end through `expo-router`'s test renderer.

Below that boundary everything is faked — keychain, file system, biometric
prompt, camera, photo picker, OCR engine — so the tests prove the app uses
those modules correctly *as the fakes describe them*. Where a fake models
platform behaviour (Android dropping a prompt started in the background,
the picker copying photos into the cache), it follows the platform source it
was checked against; it is still no substitute for a physical device, on which
the native modules have not yet been exercised.
