# What the app does now, and what is hidden

Cut down on 2026-09-28. The whole app as it stood before is on the branch
`archive/full-app-2026-09-28` (tag `full-app-2026-09-28`); nothing was
deleted.

## What it does

1. **A photo in, or a barcode.** The camera, or a photo from the phone's
   gallery (in release builds since the same day: it is how a caregiver adds
   bottles), or a barcode on the box.
2. **The medicine identified.** A barcode names the exact product (NDC →
   RxNorm). A photo names the medicine by the name printed on it, matched to
   its ingredient in RxNorm (`features/drugs/identify-name.ts`), only when the
   name reads whole and the match is certain; see below.
3. **What it is approved to treat.** The Indications and Usage section of its
   FDA label, from DailyMed, word for word (`features/drugs/approved-uses.ts`):
   under a heading that says what it is and that it is in English, with the
   label named, and a note that the medicine may be prescribed for other
   reasons and that this is the FDA-approved indication, not the doctor's
   reason. The heading and note are safety copy, English until reviewed.
4. **The strength and directions, as read**, with every withholding rule as it
   was: a field damaged or cut off at the label's edge is never shown as if it
   were whole.
5. **Saved to the list**, behind the PIN lock, in encrypted storage.
6. **Reminders.**

## What is hidden, and what came back

Each feature is one flag in `src/features/scope.ts`. The tests of every
feature run whichever way its flag is set (`withScope` and `withFullScope` in
`integration/app-harness.ts`), so turning one back on is a flag, not a
rewrite. The review sheet leaves out a hidden feature's strings until it
returns (`hiddenWith` in `scripts/copy-context.ts`).

| Flag | What it is | Now |
| --- | --- | --- |
| `fillIn` | Typing in, from the bottle, the words the camera saw only part of | **On** again since 2026-10-02 |
| `curveMessage` | Telling the user the label curves round the bottle, and to turn it | **On** again since 2026-10-02 |
| `sweep` | Reading a curved label while the bottle turns (Android) | Hidden: it needs a real camera to test |
| `koreanDrugNames` | 식약처's Korean ingredient names, and the ingredient lookups that fed them | Hidden: blocked on data access (`docs/blocked-on-data.md`) |

Interaction guidance (§3.4) was never on a screen, so there is nothing to
hide: its engine sits with an empty rule table, blocked on licensing and
counsel (`docs/blocked-on-data.md`).

### Why fill-in and the curve message came back

A curved label is the normal case, not an edge one: on a vial, text that runs
to the edge of the label wraps out of view, and a retake is cut in the same
place (the real vial, retaken upright and unobstructed, was still cut on the
right). Fill-in is the only recovery short of the sweep, and the curve message
is the only thing that tells the user to turn the bottle rather than look for
more light.

### Cut-off detection, and what fill-in may not undo

Cut-off detection (`features/ocr/truncation.ts`) withholds every field with a
line at the cut edge, whether or not that line's own text shows a loss. That
matters most for the name: "LISINOPRIL" at the edge may be the start of
"LISINOPRIL AND HYDROCHLOROTHIAZIDE", so a name withheld as cut is never
identified.

Fill-in offers a box only where the text itself shows what is missing ("D" of
"D2", "(50,0" of "(50,000"). A name that ends on a whole word ("LISINOPRIL",
"ATORVASTATIN CALC") gets no box, so it cannot be filled in. Filling in the
other fields does not make it whole either (`keepWithheld`): before that rule,
completing the directions left no line that looked cut, so no edge was found
at all, and the name, never looked at, read as whole and was identified.

## What a medicine's approved uses can and cannot say

Sourced and imperfect, knowingly (decided 2026-09-28):

- **It is not the reason the user takes it.** A label lists what the medicine is
  approved for. The vitamin D2 vial's label lists hypoparathyroidism, refractory
  rickets and familial hypophosphatemia, not low vitamin D. The note under
  every label's text says so, and is not to be softened.
- **It is prescriber's English**, verbatim: the label's Highlights summary
  where it has one (34 to 161 words for the drugs checked), else the whole
  section. Nothing is shortened or reworded.
- **Only from an FDA-approved label** (NDA, ANDA, BLA, authorised generic), so
  that "FDA-approved indication" is true. A product sold without approval, or
  under an OTC monograph, shows "no FDA-approved label", not its uses.
- **From a photo, a label of the same ingredient, not the same product.** The
  newest approved label of the form the reading names (capsule or tablet)
  whose active ingredients are exactly the medicine's, by name; which label it
  was is named under the text. A barcode gets the product's own label.
- **Every label proves it is this medicine's.** DailyMed's lookups are loose:
  its NDC search matches by prefix ("70518-317" returned an ibuprofen for a
  terazosin), and its list for an ingredient holds unrelated labels (ascorbic
  acid's held an omeprazole). So a barcode is looked up by its full package
  code and its label must list that product's code; a name's label must have
  exactly the medicine's active ingredients. A label that cannot prove it is
  not shown, and where none can, the card says no FDA-approved label was found.
- **Verbatim includes its typography.** A superscript stays raised ("10⁹/L",
  never "109/L"), a subscript lowered ("B₁₂"), and a nested list nested; where
  a character has no raised form it is marked ("Grade 1^b").
- **Some names identify nothing.** A misread, an abbreviation RxNorm would have
  to guess at ("HYDROCODONE/APAP", "LISINOPRIL-HCTZ"), or a name where the best
  matches disagree, says it could not be identified rather than guessing.
- **It needs a connection**, and says so, with a way to try again.
- **It is looked up, not stored.** The label may be revised; the medicine's
  page fetches the current one each time. What the name was identified as is
  saved with the medicine (`nameMatch`) and cleared if the name is edited.
- **A name its reading withheld stays unidentified**, on the medicine's page as
  on the reading (`nameIncomplete`): a name cut off at the edge ("LISINOPRIL"
  of "LISINOPRIL AND HYDROCHLOROTHIAZIDE") would otherwise be identified as
  another medicine. The page shows it as possibly cut, does not offer "yes, I
  checked it", and identifies it only once the user has saved the name from
  the edit form, where the same warning sits under it.

## What leaves the phone

Before, one thing: a barcode's NDC, to RxNav. Now also: for a photo, the
medicine's name as read, to RxNav, as soon as the reading is shown and before
the user has checked it against the bottle; for a medicine whose name the user
typed or edited, that name; for a barcode, its RxNorm code once more, to check
a label's ingredients against; and for every medicine shown, requests to
DailyMed for its label. All to NLM, over HTTPS, with no identifier, and never
the list or a photo. The introduction says so (`privacy.lookup`, English until
reviewed).

One gap remains, and the copy does not promise past it: the name sent is
whatever the reading took for the medicine's name. The parser can, rarely, take
another name-shaped line for it: when the name's own line was lost and a line
such as the patient's name sat directly beside the strength and a "Generic
for" line (see `nameFromNeighbours` in `sig-parser.ts`). That name would then be
sent. Guarding against it by the ingredient lexicon is not possible yet (it
knows 35 medicines, and the vial's own "VITAMIN D2" arrives by this very path);
looking a name up only after the user confirms it would close the gap, at the
cost of the uses appearing only after that step.
