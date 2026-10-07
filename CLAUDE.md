# 약 도우미: standing rules

This app tells older Korean speakers about their US prescription medicines.
They are the people least able to check what it says. The rules below are not
preferences: each one is there because breaking it would show a patient
something wrong in a confident voice. If a task seems to need breaking one,
stop and ask the project owner rather than finding a way round it.

What the app is and why it is built this way: `README.md`. Setting up a
machine: `SETUP.md`.

## The rules

**Refuse rather than guess.** Every field is either right or visibly
withheld, never clean and wrong. A name cut off at the label's edge, damaged
directions, a bottle that matches products approved for different things:
the app says so, or asks, and shows nothing it is unsure of. Never loosen a
refusal to improve a score, a coverage number or a test.
→ README ("The rule behind it"), `docs/scope.md`, `src/features/ocr/truncation.ts`,
`src/features/ocr/field-integrity.ts`

**Medical content only from attributed sources, never written by Claude.**
What a medicine treats is its FDA label's Indications section from DailyMed,
verbatim. Identity is RxNorm's. Nothing medical is written from memory or
generated: not a use, a warning, an interaction, a dosing explanation or a
plain-language summary. That holds for placeholders too. Every claim reaches
the screen with its source (`AttributedGuidance`).
→ `src/features/guidance/attribution.ts`, `docs/blocked-on-data.md`

**Never repair or fuzzy-match a drug name.** Text read from a label is never
corrected. A name is looked up only as exactly the words given: a misspelling
matches nothing, even when RxNav offers the right spelling. A name cut off at
the edge, or with Korean in it, is not looked up at all.
→ `src/features/drugs/identify-name.ts`, `src/features/ocr/name-entry.tsx`

**No Korean without review.**
- New copy goes in with `untranslated()` in `src/i18n/strings.ts`. It shows
  English until the reviewer's Korean replaces it, and reaches her through
  `npm run copy:pending -- --export batch.csv`.
- `aiKorean()` (marker `koBy: 'ai'`) puts unreviewed Korean on screen, and is
  used only when the project owner says so. Its English stays visible until she has
  reviewed it.
- Safety strings are never drafted. She writes them: the uses heading and
  disclaimer, and the warnings that reminders will not sound.
- Reviewed Korean is checked against her returned sheets (`docs/reviews/`).
  Don't edit it. A string whose meaning changes goes back to her as pending.
- A string that quotes a phone setting's name also goes on
  `docs/check-on-a-real-phone.md`.
→ `content-drafts/README.md`, `scripts/copy-context.ts`

**Parked features stay parked.**
- Interaction warnings: the rule table stays empty. CredibleMeds is off the
  table; don't build against it.
- A plain-language "what this medicine is for".
- Korean ingredient names.

Each waits on a licence, counsel or data access, not on code. Hidden features
stay behind their flags in `src/features/scope.ts`. Don't fill a table or turn
a flag on without the project owner's decision.
→ `docs/blocked-on-data.md`, `docs/scope.md`

**Run the label-scan replay before changing label-lookup rules**
(`src/features/drugs/approved-uses.ts`, `identify-name.ts`). Compare your working
tree against HEAD across about a thousand bottles of the 200 most-prescribed
medicines, and report what is lost and gained:

    npm run label-scan:replay

→ `tools/label-scan/README.md`, `docs/label-scan.md`

**Research data never in `android/` or temp folders.** `android/` is generated,
and prebuild may replace it wholesale. Temp folders get cleaned. Fetched data
goes in a git-ignored folder inside the repo, such as `tools/label-scan/data/`.
The scripts that produce it are committed.
→ `docs/release-build.md` (what was lost from `android/` once)

**No patient's details, ever.** Real label photos, and anything read from
them, never go into the repo, a commit, code or a message. A label carries a
name, an address and a prescription number. Readings kept for tests are
redacted in shape: every letter X, every digit 0. The app itself never
stores a photo.
→ `src/features/ocr/eval/corpus.ts`, `docs/sweep-privacy.md`

## Before committing

    npm run typecheck
    npm run lint
    npm run test:unit
    npm run test:integration

## Expo

@AGENTS.md
