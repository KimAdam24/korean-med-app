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

## What is hidden

Each is one flag in `src/features/scope.ts`; setting it to `true` restores the
feature as it was. The tests of every hidden feature still run, with the flags
turned back on (`withFullScope` in `integration/app-harness.ts`), so a
restored feature is a tested one. The review sheet leaves out a hidden
feature's strings until it returns (`hiddenWith` in `scripts/copy-context.ts`).

| Flag | What it was | Why hidden |
| --- | --- | --- |
| `sweep` | Reading a curved label while the bottle turns (Android) | Out of the smaller scope. |
| `fillIn` | Typing in, from the bottle, the words the camera saw only part of | Out of the smaller scope. **See below.** |
| `curveMessage` | Telling the user the label curves round the bottle, and to turn it | Out of the smaller scope. The detection behind it stays; see below. |
| `koreanDrugNames` | 식약처's Korean ingredient names, and the ingredient lookups that fed them | Blocked on data access (`docs/blocked-on-data.md`). |

Interaction guidance (§3.4) was never on a screen, so there is nothing to
hide: its engine sits with an empty rule table, blocked on licensing and
counsel (`docs/blocked-on-data.md`).

### Fill-in was the only thing that recovered a curved-label reading

Without it, a label whose words run round the curve of the bottle can only be
retaken, and a retake of a curved label is cut in the same place: the real
vial, retaken upright and unobstructed, was still cut on the right. Fill-in let
the reader type the missing part from the bottle, checked, and shown back
before it was accepted; the sweep read it from later frames, but only on
Android. **If real labels turn out to hit the curve often, fill-in comes
back.** How often is not known yet: the corpus has one real vial.

### The curve message is hidden, but not the detection behind it

Cut-off detection (`features/ocr/truncation.ts`) stays on. It withholds a
field cut off at the label's edge, and that matters more now than before:
"VITAMIN D" cut from "VITAMIN D2" would be matched as a different medicine,
so a name withheld as cut is never identified. A cut field still says it may
be cut, in the plain edge wording (`result.curved.edgeNote`). What is gone is
the curve's own explanation and remedy (turn the bottle and take another
photo), and, on a degraded reading of a label known to curve, any advice at
all: it used to be kept from "try somewhere brighter" only by the curve
message, and more light does not bring round what is out of sight.

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
  newest approved label of the form the reading names (capsule or tablet) and
  the same number of active ingredients; which label is named under the text.
  A barcode gets the product's own label.
- **Some names identify nothing.** A misread, an abbreviation RxNorm would have
  to guess at ("HYDROCODONE/APAP", "LISINOPRIL-HCTZ"), or a name where the best
  matches disagree, says it could not be identified rather than guessing.
- **It needs a connection**, and says so, with a way to try again.
- **It is looked up, not stored.** The label may be revised; the medicine's
  page fetches the current one each time. What the name was identified as is
  saved with the medicine (`nameMatch`) and cleared if the name is edited.

## What leaves the phone

Before, one thing: a barcode's NDC, to RxNav. Now also, for a photo, the
medicine's name as read, to RxNav, and for every medicine shown, a request to
DailyMed for its label. All to NLM, over HTTPS, about the medicine alone: never
the list, a photo, or anything identifying the user. The introduction says so
(`privacy.lookup`, English until reviewed).
