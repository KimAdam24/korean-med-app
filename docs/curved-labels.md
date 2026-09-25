# Labels cut off by their own curve

On a narrow vial with lines running the full width of the label, the ends of
the longest lines are round the curve, out of the camera's sight. On the
vitamin D2 vial the `00` of `50,000` and the `7` of `every 7 days` sit past that
edge. It is not blur, light or framing, and turning the bottle to bring the
right edge into view takes the left edge out. No single photo of that bottle
holds its whole sig.

`src/features/ocr/truncation.ts` says so, instead of "try somewhere brighter".

## The signal

Two things at once, both required:

1. **Where lines end.** Several lines end together at the right-most (or
   left-most) extent of the text: within half a line's height of each other,
   measured along the text's own direction, so a tilted photo does not smear
   the edge. They are the *widest* lines, not lines inset from the widest — a
   cut line runs out exactly where the label turns away, and nothing visible
   goes further.
2. **What they end on.** At least two of those lines end with something
   missing (`endsCutOff` in `field-integrity.ts`): a thousands group short of
   digits (`(50,0`), a stray letter (`(b`), the start of a word without its
   end (`eve`), or a word that needs a number whose number never arrives
   (`every` above `days`). A trailing comma, an open bracket and an unknown
   word are deliberately not evidence: all three occur in ordinary wraps.

## What it rests on

| Reading | Lines at the edge (right x) | Next-widest | Called |
| --- | --- | --- | --- |
| Vial, first capture (tilted 8°) | `Take 1 capsule (b` 597, `units) by mouth eve` 594 | 556 | right, directions |
| Vial, retaken upright | `\|Take 1 capsule (50,0` 1863, `units) by mouth every` 1860 | 1637 | right, directions |
| Vial, first reading, no geometry | — | — | nothing (no geometry) |
| Stock template, 18 synthetic labels | — | — | nothing |

Plus hand-built layouts in `truncation.test.ts`: a flat label with a ragged
right edge, one whose direction lines reach the margin together on whole words,
one damaged line at the margin, damaged line ends that do not line up — none
called — and a tilted curve and a left-edge cut, both called.

**That is thin, and it is two photos of one bottle.** It shows the signal
separates the cases constructed so far; it does not show it separates real
flat labels with ragged edges from real curved ones. It is tuned to
under-trigger — two cut lines, not one — and the eval now fails on any new
diagnosis a case does not expect. What would firm it up: flat labels whose
direction lines run to the margin (an OTC box, a pharmacy bag label), and other
vials, photographed the way users will.

## What it changes

- The result screen says the label curves round the bottle, on which side,
  that more light will not help, and — when only the directions are at the
  edge — that the name and strength were read in full.
- **A field with any line at the edge is withheld and not saved, whatever its
  own text looks like.** A cut can remove a whole word and leave text that
  reads cleanly and wrongly: `every other day` with `other` round the curve is
  `every day`. `truncation.test.ts` builds exactly that case.
- The eval scores cut fields as withheld, and reports the diagnosis per case.

## Known gap

On the retaken vial the parser did not extract the directions at all: the
label's own left edge read as a leading `|`, and "|Take …" does not start with
a direction verb. The diagnosis still attributes the cut lines to the
directions (by the parser's own line classifier, ignoring leading
punctuation), so the screen says why the directions are missing — but they are
missing. Letting the parser ignore a leading edge mark when *classifying* a
line, without changing its text, would recover them as damaged evidence. Not
done: it is a parser change, and the rule against repairing OCR text deserves
its own decision.
