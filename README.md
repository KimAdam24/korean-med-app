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

| Area                                | State                                             |
| ----------------------------------- | ------------------------------------------------- |
| Camera capture, photo discarded     | Built                                             |
| Label recognition (§3.1)            | Seam only — no provider wired in                  |
| App lock, biometric + PIN (§3.3)    | Built                                             |
| Encrypted medication storage (§3.3) | Built                                             |
| Korean translation (§3.2)           | Decided, not built                                |
| Interaction guidance (§3.4)         | Not started, by choice — needs authoritative data |

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

### Label recognition is not connected

`recognizeLabel` returns `not-configured` rather than plausible-looking
placeholder data, because a fake dose is indistinguishable from a real one once
it reaches the profile. `barcodeScannerEnabled` is `false` in `app.json` pending
the OCR/barcode data-source decision, which blocks this.

### The PIN lockout can be shortened by changing the device clock

The lockout schedule reads `Date.now()`. Defeating it requires already holding
an unlocked phone, at which point the PIN is not what protects the data — the
hardware-backed key is. Accepted knowingly; see `src/features/security/pin.ts`.

### Test coverage is uneven

The UTF-8 codec is tested thoroughly, against Node across the whole BMP, because
silent mojibake in a dosage line is a correctness bug. The keychain, AES and
biometric paths have no automated coverage — they need a real device, and have
not yet been exercised on one.
