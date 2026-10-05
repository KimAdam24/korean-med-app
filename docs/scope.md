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
   reason. The heading and note are safety copy, never drafted: written by
   the reviewer herself (2026-10-04).
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

### Typing the name from the bottle

Without a name there is nothing to look up, so where the reading could not
give the name whole (cut off at the edge, not read clearly, or not found), the
result screen asks for it: a box under the name, prefilled with what was read,
to type it as the bottle shows it (`features/ocr/name-entry.tsx`). The card
says why there is nothing to show yet (`uses.nameNotWhole`), rather than only
that nothing was identified.

- **Checked, never fuzzy.** A typed name is looked up exactly as a read one:
  RxNorm's best match must name the medicine in exactly the words given, salts
  and forms aside, none changed and none added. A misspelling ("VITAMN D2")
  matches nothing, though RxNorm offers the right spelling, and the card says
  to check each word against the bottle; one word of a longer name ("ACID")
  is not that name. The keyboard's own correction is off in the box, so it
  cannot change a word either. This is not to be loosened.
- **Shown as the user's.** The name is marked "typed by you from the bottle",
  and what it identified as is shown ("Identified from the name you typed
  as: ergocalciferol"), to compare with the bottle.
- **Saved as typed.** Every record now says where its name came from
  (`nameSource`): `read` from the label, `typed` by the user (here, or by
  editing it later), or `rxnorm` for a barcode. A typed name is a different
  kind of evidence from a read one, and any later cross-check (a printed NDC
  against the name, say) needs to know which it holds.

## What a medicine's approved uses can and cannot say

Sourced and imperfect, knowingly (decided 2026-09-28):

- **It is not the reason the user takes it.** A label lists what the medicine is
  approved for. The vitamin D2 vial's label lists hypoparathyroidism, refractory
  rickets and familial hypophosphatemia, not low vitamin D. The note above
  every label's text, read before it, says so, and is not to be softened.
- **It is prescriber's English**, verbatim: the label's Highlights summary
  where it has one (34 to 161 words for the drugs checked), else the whole
  section. Nothing is shortened or reworded.
- **Only from an FDA-approved label** (NDA, ANDA, BLA, authorised generic), so
  that "FDA-approved indication" is true. A product sold without approval, or
  under an OTC monograph, shows "no FDA-approved label", not its uses.
- **From a photo, a label of the same ingredient, salt, release and kind, not
  the same product.** An approved label of the form the reading names
  (capsule or tablet) whose active ingredients are exactly the medicine's, by
  name; which label it was is named under the text. A barcode gets the
  product's own label.
- **The salt, release and kind printed decide which** (2026-10-02). Before
  this, METOPROLOL SUCCINATE ER was shown the metoprolol tartrate tablets'
  label, which does not list heart failure, and a prescription esomeprazole
  capsule an over-the-counter one's "Uses". Now:
  - a salt printed ("SUCC", "TARTRATE", "MAG") must be in the label's own
    active ingredient;
  - a release printed (ER, XL, SR, CD: extended; DR, EC: delayed) must be in
    the label's title, or its own text. With none printed, RxNorm's clinical
    drugs say which releases are made at the strength (2026-10-05): one, and
    a label of another is refused (omeprazole is always delayed-release);
    two, and the user is asked which marker the bottle shows beside the name
    (`uses.releaseQuestion`: ER, XL, SR, CD, XR, CR, LA, or DR, EC; a tap
    each, or "none of these", released at once). The answer is taken as a
    printed marker would be, kept with the medicine as `releaseMarker`
    (marked `typed`, the user's word), and forgotten when the name is
    edited. Labels released at once used to be tried first, a guess: an
    extended-release bottle whose marker went unread was shown the uses of
    the one released at once (clonidine ER, for ADHD alone, blood pressure);
  - a pharmacy's label (its Rx number, refills, quantity, prescriber, fill or
    discard date, "generic for", or "Rx only") is shown the prescription
    label, or the over-the-counter one where there is none, since a pharmacy
    can dispense either; a package's Drug Facts, the over-the-counter label;
    and a reading with neither, nothing, where both kinds have a label
    (`uses.kindUnknown`). Saved as `labelKind`, since the lines are not.
  Where no label of what was printed is found, the card says none was: never
  another salt's. Checked live: metoprolol succinate ER, "METOPROLOL ER" and
  TOPROL XL all get the succinate label, the tartrate its own; esomeprazole,
  ibuprofen, famotidine, omeprazole, loperamide and naproxen get their
  prescription labels from a pharmacy's label, and nothing without one.
  Records saved before this have no `labelKind`, so a medicine sold both
  ways shows nothing on their page.
- **Exactly this medicine** (2026-10-05, after a review that found each of
  these live). A label's active ingredient must be the medicine's name
  exactly, or with only a carrying salt, its water or, for a medicine not
  itself a salt, a metal: a calcium supplement was shown calcium acetate's
  label (kidney failure). The strength printed must be among the label's
  products' strengths, where it gives one in the same measure: finasteride
  5 mg was shown the 1 mg hair-loss label, sildenafil 20 mg (and REVATIO)
  the erectile-dysfunction one. Most of a list is repackagers' labels of one
  strength each, so candidates are first screened by DailyMed's packaging
  summary (about a kilobyte each, six at a time, up to 24), and only labels
  of the strength are downloaded. A brand printed puts its own label first.
  By name, a label must be of a medicine taken by mouth (its route): not a
  tablet put in the vagina. Another product's release marker ("(SR)" for an
  XL bottle), in the title or the label's own words, is refused. And the
  form is taken from text read whole, or from cut text only where it says
  the medicine is swallowed ("by mouth") or that it is not: "INSERT 1 TABLET
  VAGIN", cut before "VAGINALLY", passed for a tablet to swallow.
  Checked live on 40 medicines: all found but the calcium supplement, which
  is refused, each in about a second.
  Products of one ingredient, strength and form approved for different
  things, that only the brand tells apart, are refused unless the brand is
  printed, and then shown only that brand's label (`uses.productUnknown`):
  tadalafil 20 mg, CIALIS (erectile dysfunction, enlarged prostate) or
  ADCIRCA and ALYQ (pulmonary hypertension), whose generics share one title;
  and bupropion SR 150 mg, WELLBUTRIN SR (depression) or ZYBAN (smoking
  cessation), 7 of whose 368 labels are ZYBAN's generics, titled like the
  rest, unless the bottle says XL, which none of those is (2026-10-05, every
  label read; a first look at 40 of them had missed these).
  Still not told apart: an over-the-counter strength dispensed by a pharmacy
  where a prescription label gives the same strength.
- **What a scan of every top-200 label found** (2026-10-05,
  docs/label-scan.md), each now refused rather than shown:
  - five more products only the brand tells apart (nifedipine ER, fluoxetine
    tablets, semaglutide tablets, cyclosporine, diltiazem ER 120 mg), refused
    without it; MODIFIED, and diltiazem's CD or XR, stand in for the brand;
  - a brand's own label for a bottle that does not print the brand (GRALISE,
    INDERAL XL, XARELTO 2.5 mg list other uses than their generics at the same
    strength), unless no label without a brand is found for the bottle
    (CHILDREN'S ALLERGY RELIEF's loratadine 5 mg);
  - a label whose text is not uses (a bullet, a fragment, a boxed warning, a
    guide, directions, pharmacology), whose tablets are of two medicines, or
    whose title or text is of another release; and one of a prodrug (valacyclovir
    for acyclovir, gabapentin enacarbil for gabapentin);
  - no strength read, where RxNorm makes more than one (`uses.strengthUnknown`);
  - a label giving strengths of two products made at none of each other's
    (sildenafil 20 mg and 50 mg on one DIRECT RX label, with the 20 mg's
    pulmonary hypertension).
  And no list is cut short: every page of DailyMed's list is read, where only
  the first hundred labels were (a bottle printing GABARONE never found its
  own label, 177th); and the list of the exact product RxNorm says the bottle
  is (its strength, form and release) is read first, its labels needing no
  screening for the strength, then, where none is found, the ingredient's
  (23 more bottles of 1,071 find a label, and the median lookup screens none).
  `tools/label-scan/` replays the lookup over every product of the top 200
  medicines, and is rerun whenever its rules change.
  Replayed over every product of those medicines, a clean reading of the most
  common bottle shows a label for 155 of the 195 that identify (142 at once,
  13 after the release question), against 158 before; the three lost are the
  products only the brand tells apart.
  Not caught: a label with another medicine's uses that names neither (2
  labels).
- **Looked up once a session.** What a lookup found is kept while the app is
  unlocked, so opening fill-in or a medicine's page again does not ask again
  or send the name again; forgotten on lock and on erase, and never kept
  when it could not be reached.
- **By name, only for a tablet or a capsule** (2026-10-02). A medicine's forms
  have different labels with different uses: timolol's tablets are for blood
  pressure, its eye drops for glaucoma; budesonide's capsules for Crohn's
  disease, its inhaler for asthma. A name says which medicine, not which form,
  and eye drops, a patch, an inhaler and an injection were all shown their
  tablets' uses. So a label is looked for by name only where the reading's
  name, strength or directions say tablet or capsule (softgel, caplet), and
  none say drops, eye, inhale, puff, patch, apply, inject, spray, nasal,
  vaginal, rectal and the like. Otherwise the card says uses are shown only
  for tablets and capsules (`uses.formUnknown`), and DailyMed is not asked.
  This also refuses a tablet whose directions were cut before the word: the
  user can type the directions on its page, which then decide. A barcode is
  not affected; its product is of one form.
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
- **The salt is part of the name.** It is asked for as printed ("POTASSIUM
  CHLORIDE", "METFORMIN HYDROCHLORIDE"), with the salts pharmacy labels shorten
  spelled out (HCL, BESY, CALC, SUCC, MAG, PROP) and release markers (ER, XL,
  CD) left out. Only a salt that carries the medicine (succinate,
  hydrochloride, maleate...) is left out, on a second try, where RxNorm has no
  name with it; never a metal or a salt that is the medicine, so CALCIUM
  GLUCONATE is never asked as "gluconate".
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
typed or edited, that name; for a barcode whose package DailyMed does not
list, its RxNorm code once more, to check a label's ingredients against; and
for every medicine shown (by name, a tablet or capsule), requests to
DailyMed for its label. All to NLM, over HTTPS, with no identifier, and never
the list or a photo. The introduction says so (`privacy.lookup`, reviewed
2026-10-04).

One gap remains, and the copy does not promise past it: the name sent is
whatever the reading took for the medicine's name. The parser can, rarely, take
another name-shaped line for it: when the name's own line was lost and a line
such as the patient's name sat directly beside the strength and a "Generic
for" line (see `nameFromNeighbours` in `sig-parser.ts`). That name would then be
sent. Guarding against it by the ingredient lexicon is not possible yet (it
knows 35 medicines, and the vial's own "VITAMIN D2" arrives by this very path);
looking a name up only after the user confirms it would close the gap, at the
cost of the uses appearing only after that step.
