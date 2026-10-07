# 약 도우미 — Korean Medication Assistant

A phone app that reads a US prescription bottle and explains it in Korean. It
is for older Korean speakers who take several medicines and cannot easily read
the English on the label: the people least able to check what an app tells
them about their medicine.

Point the camera at a pharmacy bottle, scan a box's barcode, or choose a photo.
The app reads the label on the phone itself, identifies the medicine against
the U.S. National Library of Medicine's drug vocabulary, and shows:

- **the name, strength and directions** as the bottle prints them, or, where
  any of them could not be read with certainty, a plain statement that it could
  not, and what to do;
- **what the medicine is approved to treat**, quoted word for word from its
  FDA label, under a note that a doctor may prescribe it for other reasons;
- **daily reminders**, which say plainly when the phone will not let them ring.

The app is Korean first. A button shows the English beside it for a family
member or a pharmacist. The medicine list is encrypted on the phone and never
leaves it, and photos are never kept.

Built with Expo (SDK 57) and React Native 0.86, in TypeScript, with native
modules in Swift and Kotlin.

## The rule behind it: right, or visibly withheld

A medication app that is wrong in a confident voice is worse than none, and
these users cannot catch it: that is why they need the app. So every field the
app shows is either right or visibly withheld, never clean and wrong. Most of
the design follows from that.

**Refuse rather than guess.**

- A name cut off at the label's edge is not looked up. "VITAMIN D" is what is
  left of "VITAMIN D2" round the curve of a vial, and it is a different
  medicine. The user is asked to type the name from the bottle instead.
- Directions with recognition damage are never shown as directions. The first
  real label tested lost the "UP" of "UP TO 3 TIMES DAILY", which turns a
  ceiling into a schedule. The raw reading is available behind a tap, captioned
  as inaccurate, with the damaged words marked.
- Identification by name is exact. A misspelling matches nothing, even when the
  lookup service offers the right spelling: no fuzzy matching, typed or read. A
  name with Korean in it is not looked up at all, because the English part
  alone is only part of the name.
- Where products of one strength are approved for different things, and only
  the brand, the release or the strength tells them apart, a bottle that does
  not show which gets no label. Where only the release marker is missing, the
  app asks instead: "Does the bottle say ER, XL, SR or CD?"
- A barcode whose digits fit more than one product code asks the user which,
  rather than picking.

**Sourced and attributed.** Every medical statement the app makes is someone
else's: the FDA's, or RxNorm's. Attribution is carried in the type system
(`AttributedGuidance`), so no screen can show a claim without its source. The
approved uses are the label's Indications section, verbatim; the one thing
folded away is the FDA's standard background paragraphs on blood pressure,
never a use and never a limitation. No medical content is generated or written
from memory. Three features are parked for exactly that reason (below).

**Never repair a drug name.** Recognised text is never "corrected". A wrongly
corrected name or dose looks exactly like a right one; visibly broken text at
least announces itself.

**Korean that has not been reviewed says so.** A native Korean speaker reviews
the app's wording in batches. Each batch goes out as a spreadsheet: every
string with where it appears and when, and a draft to correct rather than
write. The returned sheets are kept as the record, and a test fails if the
app's Korean drifts from them. Safety warnings are written by the reviewer,
never drafted. The few strings shipped ahead of review are marked as
AI-completed and keep their English beside them until the reviewer has read them.

## Privacy

- **Photos are never stored.** A capture is deleted before the capture path
  returns, and the path refuses to hand back pixels it could not delete. A
  photo chosen from the gallery is read from the picker's own copy, which is
  deleted the same way; the user's original is untouched.
- **The list is the user's alone.** Records are sealed with AES-GCM under a
  random key held in the keychain as `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so the
  key never travels in a backup. The app locks with biometrics or a PIN. While
  it is locked, the screens are not mounted at all, so nothing medical sits in
  memory behind the lock screen. The app switcher's thumbnail is blanked.
- **What leaves the phone** is the medicine's name or barcode number, sent to
  the National Library of Medicine (RxNav and DailyMed) over HTTPS with no
  identifier. The list never leaves, and neither does a photo. Reminders give
  the phone's scheduler an identifier and "Time for your medicine", never a
  medicine's name, since notifications show on the lock screen.

## How it works

```
 camera · gallery · barcode
            │
 modules/label-ocr        Apple Vision (Swift) · ML Kit (Kotlin), on the phone
            │             lines of text, with their geometry
 src/features/ocr         reading order → label parser → field integrity → cut-at-edge check
            │             name, strength, directions: each a value, or withheld
 src/features/drugs       identify (RxNorm, exact) → products (RxNorm) → labels (DailyMed)
            │             → which label fits this bottle → its Indications, verbatim
 screens (expo-router) ── encrypted vault ── reminders
```

### Reading the label

`modules/label-ocr` is a small native module written for this app: Apple
Vision on iOS, ML Kit on Android, both on-device. No maintained community
library was current with the SDK when it was written. It returns lines of text
with their corners. Reading order is rebuilt in TypeScript from that geometry
(`reading-order.ts`), following each line's slope, so a printed line bent round
a vial stays one line. A parser picks the name, strength and directions by
content. `field-integrity` then decides, field by field, whether the text can
be shown as a value or only as damaged text, and `truncation` withholds
anything cut off at the label's edge.

### Finding the right label

The hard part is not reading the bottle; it is choosing which FDA label
describes it. DailyMed holds tens to hundreds of labels for a common medicine:
the brand, each generic maker, each repackager. They do not all say the same
thing. One strength of tadalafil is a drug for erectile dysfunction under one
brand and for pulmonary hypertension under another, and clonidine treats blood
pressure released at once but ADHD as an extended-release tablet.

So the lookup narrows by what the bottle actually shows: the exact product
first, then release, strength, salt and brand. It refuses a label written for
two products, and prefers the manufacturer's own label to a repackager's copy.
Where the bottle does not say enough, the app shows no label rather than a
plausible one.

Those rules were found and are guarded by a regression tool, `tools/label-scan`.
It reads every DailyMed label (about 32,000) for the 200 most-prescribed US
medicines, then replays the app's own lookup for a typical bottle of every
product of them. Each change to the rules is measured against it, as losses and
gains bottle by bottle. Today the most common bottle of 155 of the 195 that
identify gets a label, 13 of them after the release question. The rest are
refused on purpose, because their labels disagree and nothing on the bottle
says which applies. The findings are in
[`docs/label-scan.md`](docs/label-scan.md).

### Reminders

A reminder that fails silently is worse than none: someone told they will be
reminded stops remembering for themselves. So the app never reports "on" from
what it asked the phone to do. It reports what the phone says back: allowed or
blocked, the channel muted, exact alarms refused, Do Not Disturb that could
silence them. Each comes with its fix beside it. See
[`docs/reminders.md`](docs/reminders.md).

### Type, and the phone's Bold text

Every word is drawn in Pretendard, a typeface designed for Korean, bundled
with the app in five weights (SIL Open Font License 1.1). Sizes start well
above the platforms' defaults, and nothing is drawn lighter than weight 500.

The phone's Bold text setting is honoured, on Android and iPhone. React
Native does not apply it: it draws each run of text at exactly the weight its
style names. So the app does, the way Android does for its own text: every
weight plus what the setting adds (300), to the nearest bundled face. Android
reports the amount through a few lines of native code (`modules/text-weight`);
iOS says only on or off, and takes the same step.

## Testing

- **Unit tests** (`npm run test:unit`, Node's test runner, about 400): the label
  parser, field integrity, reading order, the label rules against DailyMed- and
  RxNav-shaped answers, and the review-sheet pipeline.
- **Integration tests** (`npm run test:integration`, Jest, about 220): the real
  app end to end above the native boundary. The vault runs with real AES-GCM,
  and the screens through `expo-router`'s test renderer. Native modules are
  faked, with the platform behaviour each fake models checked against platform
  source.
- **A recognition scorecard** (`npm run eval`): real readings, redacted in
  shape (every letter becomes X, every digit 0) so no patient's details are
  kept, scored on the one thing that matters: no field shown as a value that is
  not what the label says.
- **The label scan replay**, above.

What none of this reaches: a physical phone. The app has been run on an
Android emulator, including a real dispensed label read from a photograph. On
iOS it builds for the simulator on EAS, most recently on 2026-10-05. Neither
has read a bottle through a real camera.

## What is parked, and why

Each of these stopped at the same rule: medical content only from an
authoritative source the app is allowed to use.

| Feature | Built | Why it waits |
| --- | --- | --- |
| Warnings about medicines that should not be combined | The engine, tested; its rule table is empty | Licensing of the data, and regulatory counsel |
| "What this medicine is for", in plain words | Instead, the label's own words, shown today | The only patient-language source is licensed |
| Official Korean ingredient names (식약처) | The importer and the display; the table is empty | Access to the Korean government's dataset |
| Reading a curved label while the bottle turns | Android: built, and replayed from video on an emulator. iOS: written, and compiles | A real camera to test with; the iOS half not yet linked |
| Reading aloud | Not started | Constraints in [`docs/tts-feasibility.md`](docs/tts-feasibility.md) |

The first three are set out in [`docs/blocked-on-data.md`](docs/blocked-on-data.md):
what was built, what each source's terms allow, and what would unblock it.
What is hidden behind a flag, and why, is in [`docs/scope.md`](docs/scope.md).

The largest open question is not a feature at all: the label parser has been
measured against one real vial and one stock template. It needs ten to twenty
real bottles, photographed the way users will photograph them, before its
scorecard means much.

## Open right now

Work in progress as of 2026-10-07, as opposed to what is parked above:

- **Real bottle photos,** the next real step, are being collected. Each one
  becomes a reading in the scorecard's corpus, redacted in shape before it is
  committed (`src/features/ocr/eval/corpus.ts` says how). The photos
  themselves never enter the repo.
- **The Korean review batch.** 16 strings are waiting for the reviewer:
  - 10 shown in English until the reviewer writes them. One, a warning that reminders
    cannot sound, is a safety string the reviewer writes from scratch.
  - 6 shown in Korean completed by AI, with their English beside them.

  Export the sheet with `npm run copy:pending -- --export batch.csv`. The
  reviewer's returned sheet is wired in and kept in `docs/reviews/`.
- **Checks that need a phone.** The emulator has done what it can. Still to
  try on real hardware:
  - reading a bottle through the camera, and scanning a barcode;
  - a reminder ringing on time;
  - TalkBack and Bold text;
  - the setting names in `docs/check-on-a-real-phone.md`, which differ by
    manufacturer.
- **The sweep on iOS.** Its Swift compiles (the `ios-compile-check` branch
  shows how), but it is not linked: that waits for an iPhone to run it on.
  The Android half waits for a real camera.
- **The splash screen and app icon** are still Expo's default blue: the design
  pass did not reach them.

## Running it

The app uses native modules (camera, keychain, biometrics, on-device
recognition), so **Expo Go will not run it**: it needs a development build.

**Setting up a machine from scratch:** [SETUP.md](SETUP.md) goes step by
step, from Node and the JDK to an emulator and a release build, including what
went wrong the first time. It covers Windows, tested, and a Mac with the iOS
simulator and a real iPhone, which is untested.

Node 22.23.1, pinned in `.nvmrc` and `eas.json` (22.13 is React Native 0.86's
floor, but use the pinned version so the lock file is written by the same npm
that installs from it).

```bash
npm install
npx expo run:android      # or: npx expo run:ios — builds and installs a dev client
npx expo start            # afterwards, reloads JavaScript against it
```

```bash
npm run typecheck          # app and tests
npm run test:unit          # pure logic, on Node
npm run test:integration   # the app end to end under Jest
npm run eval               # the recognition scorecard
npm run lint
npm run smoke:android -- --dev-server http://10.0.2.2:8081   # launch a real build; fail on a crash
npm run label-scan:fetch && npm run label-scan:replay        # the DailyMed scan (tools/label-scan/README.md)
npm run copy:pending -- --export batch.csv                   # the next Korean review sheet
```

## Where things are

```
src/app/                 screens (expo-router)
src/features/ocr/        reading order, label parser, field integrity, the scorecard's corpus
src/features/drugs/      identification and the label lookup
src/features/security/   vault, keychain key, PIN, app lock, screen privacy
src/features/reminders/  scheduling, and what the phone says back
src/features/capture/    capture that keeps no photo
src/i18n/                every word the app shows, Korean first
modules/label-ocr/       on-device recognition (Swift, Kotlin)
modules/label-sweep/     the turning-bottle reader (Kotlin; Swift written, not linked)
modules/dose-alarms/     Android exact alarms and Do Not Disturb
modules/text-weight/     Android's Bold text setting
assets/fonts/            Pretendard, with its licence
tools/label-scan/        the DailyMed scan and replay
content-drafts/          Korean drafts awaiting review, never imported by the app
integration/             end-to-end tests, and the platform fakes
docs/                    decisions, and the evidence for them
```

## Known limitations

Understood and accepted, not overlooked:

- **A new phone means adding the medicines again.** The key never leaves the
  device, by design: a key that rides a backup makes "the user" mean "whoever
  restored it". The app says the old list cannot be opened, rather than showing
  an empty one.
- **The National Library of Medicine can see which medicine an address looked
  up.** It is the cheaper disclosure: cloud recognition would have sent the
  photograph.
- **Identification is US-only**: product codes and names resolved against
  RxNorm. Korean products are not handled.
- **Recognition confidence is not comparable across platforms**, so nothing
  gates on it. A perfectly recognised line can still be the wrong line.
- **Screenshots are blocked on Android.** Android cannot blank the app-switcher
  thumbnail without also blocking screenshots, so a caregiver cannot screenshot
  the list to share it.
- **The PIN's lockout reads the device clock.** Defeating it needs an unlocked
  phone already in hand, where the hardware-backed key, not the PIN, is what
  protects the data.
