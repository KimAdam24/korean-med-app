# 약 도우미 / Korean Medication Assistant

A phone app for elderly users who take several prescriptions and are more
comfortable reading Korean. It reads a medication label through the camera,
explains it in Korean, and keeps a medication profile on the device.

Two rules shape most of the design decisions in this repo:

- **Photographs are never stored.** An image exists only long enough to be read,
  and the capture path deletes it before returning — and refuses to hand back
  pixels it could not delete. See `src/features/capture/transient-capture.ts`.
- **The profile is the user's alone.** Medication records are encrypted at rest
  under a key that never leaves this device's keychain. See
  `src/features/security/`.

## Running it

These are native modules (camera, keychain, biometrics), so **Expo Go will not
work** — the app needs a development build.

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
| OCR label reading (§3.1 fallback)       | Seam only — no provider wired in                  |
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

### OCR is still not connected

`recognizeLabel` returns `not-configured` rather than plausible-looking
placeholder data, because a fake dose is indistinguishable from a real one once
it reaches the profile. Barcode identification now covers the primary path, so
OCR is only needed for cartons with no readable barcode.

Wiring it needs a third-party on-device module (ML Kit / Apple Vision), and a
change to `captureTransiently`: every candidate library takes a file URI, while
capture currently deletes the file and returns base64. Recognition would have to
happen inside the transient window, before the `finally` that deletes.

Only the Latin script model is planned. ML Kit ships one model per script — at
roughly 38 MB each — and our users read English labels, so Korean OCR is not
worth the size. Korean remains the language of the guidance, not the input.

### A scanned barcode cannot say which NDC segmentation it holds

A 10-digit NDC is printed as 4-4-2, 5-3-2 or 5-4-1, and the barcode omits the
hyphens that would say which. Each scan therefore yields up to three candidate
11-digit codes, and RxNorm is asked about all of them. Usually exactly one
exists. When more than one does, the app asks the user rather than picking —
`src/features/drugs/ndc.ts` explains why at length.

### The PIN lockout can be shortened by changing the device clock

The lockout schedule reads `Date.now()`. Defeating it requires already holding
an unlocked phone, at which point the PIN is not what protects the data — the
hardware-backed key is. Accepted knowingly; see `src/features/security/pin.ts`.

### Test coverage is uneven

The UTF-8 codec is tested thoroughly, against Node across the whole BMP, because
silent mojibake in a dosage line is a correctness bug. The keychain, AES and
biometric paths have no automated coverage — they need a real device, and have
not yet been exercised on one.
