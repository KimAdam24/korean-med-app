# Content drafts — UNREVIEWED, NOT SHIPPED

Everything in this directory is a **draft for review**. None of it is imported
by the app, and none of it should be until it is signed off.

## Why these are markdown and not TypeScript

Two reasons, and both matter more than the convenience of having them already
in code.

The people who need to review this are a Korean-speaking pharmacist and a
translator. Neither should have to read TypeScript to check whether a dosing
instruction says what the English said. A table they can read and annotate gets
a better review than a source file they have to be walked through.

And unreviewed Korean medical text sitting in `src/` is one careless import away
from a screen. Outside `src/`, Metro never sees it — the safety property is
structural rather than a matter of remembering.

## What review means here

Not proofreading. Each entry is a claim about what a medicine instruction means,
which someone will act on and cannot check for themselves. A reviewer should be
willing to say: *if a patient followed this, that would be correct.*

Entries carry a confidence marker from the drafter. `?` means the draft is
uncertain and the reviewer should expect to rewrite rather than approve.

## Moving a draft into the app

1. A qualified reviewer signs off, in writing, against a named revision.
2. The approved rows are transcribed into the relevant module.
3. The review record — who, when, which revision — goes in the commit message,
   so provenance survives in `git log` rather than in someone's memory.

**Korean completed by AI.** At the owner's direction, a string of the app's
own wording can go in before she has reviewed it: written with `aiKorean()`
rather than `untranslated()` in `src/i18n/strings.ts`, and shown in that
Korean. It still goes to her. The export puts it in her next batch, with that
Korean as the draft, and her wording replaces it like any other. Never a
safety string: `scripts/copy-export.test.ts` fails if one is.

## Files

| File | Covers | Blocks |
| --- | --- | --- |
| `sig-phrases.draft.md` | Dosing instruction patterns, English → Korean. Reviewed as a sheet: `npm run copy:pending -- --export-phrases`; signed-off rows go into `src/features/directions/approved-phrases.ts` | §3.2(b) |
| `dailymed-sections.draft.md` | Which FDA label sections to show, and how much | §3.2(b) |
| `copy-batch.draft.json` | Korean drafts of the app's own wording awaiting translation (the copy batch), for the reviewer to correct rather than write; the safety warnings left blank for her. Exported beside the English by `npm run copy:pending -- --export` | Each string's move from `untranslated()` into `src/i18n/strings.ts` |
