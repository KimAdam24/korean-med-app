# Labels that disagree for one bottle (scan of 2026-10-05)

Tadalafil and bupropion SR were each found by chance, and both times a sample
hid the answer. This is the systematic look: for the medicines users are most
likely to have, every DailyMed label read, and every place where labels the
app could choose between for one bottle say different things. Nothing here is
built yet.

## What was scanned

- **The medicines:** the top 200 prescribed in the US (ClinCalc DrugStats, "The
  Top 300 of 2024", from MEPS). 195 identify by name as the app identifies
  them. The other five (the Adderall salt mix, ethinyl estradiol/levonorgestrel,
  "magnesium salts", nirmatrelvir/ritonavir, emtricitabine/tenofovir) do not,
  so the app shows nothing for them.
- **Every label:** every page of DailyMed's list for each, prescription and
  over-the-counter, not only the first 100 the app reads: 32,038 labels with a
  tablet or capsule in the title, none failed. Each was read with the app's own
  `readIndications`, and each product's form, release, strength and route came
  from its own XML.
- **Compared as the app would choose:** the 27,440 approved labels (the only
  kind the app shows), grouped by what the app tells apart: prescription or
  OTC, tablet or capsule, release, exact strengths, by mouth, active
  ingredients exactly the medicine's (`sameIngredients`). 878 groups have two
  or more labels. Each label's text was mapped to the conditions it names, its
  "Limitations of Use" set aside. 535 groups agree, 269 have labels that only
  lack a condition, and 74 have labels each naming one the others lack. All
  343 that differ were read by hand.
- **Across what the app may not read:** the same comparison across releases
  (immediate against extended) and across strengths, for a bottle whose
  release or strength was not read.
- **Each label's own text:** every approved label checked for text that is
  not its own uses: empty, a fragment, a warning, another drug's, another
  release's.

Limits: the conditions are patterns written for this, so a difference they do
not name could be missed (several "differences" were the patterns, and were
dropped by hand). Tablets and capsules only, the only forms looked up by name.
Which label a user gets depends on DailyMed's order: the app reads the first
100 listed and downloads up to four. Labels change; this is DailyMed on
2026-10-05.

## The size of it

| | What | Medicines |
| --- | --- | --- |
| 1 | Different products, one strength and form, told apart only by the brand (or one word) | 7, 2 of them built |
| 2 | A brand's own label, listing other uses than its generics at that strength | 7 |
| 3 | Text that is not the label's own uses, passing every check: 51 labels | 29 |
| 4 | Uses that differ by release, where the release is not read | 13 |
| 5 | Uses that differ by strength, where the strength is not read | 10 |
| 6 | One product, labels of different dates or carve-outs | most of the 343 groups |

## 1. Different products that only the brand tells apart

The tadalafil shape: at one ingredient, strength and form, products approved
for different things, whose generics are titled alike.

| Medicine | Strength and form | The products | What could tell them apart |
| --- | --- | --- | --- |
| Tadalafil | 20 mg tablets | CIALIS (erectile dysfunction, BPH) / ADCIRCA, ALYQ (pulmonary arterial hypertension) | built: refused without the brand |
| Bupropion | SR 150 mg tablets | WELLBUTRIN SR (depression) / ZYBAN's generics (smoking cessation) | built: refused without the brand |
| Nifedipine | ER 30, 60, 90 mg tablets | PROCARDIA XL's kind, 75 labels (angina, hypertension) / ADALAT CC's kind, 43 labels (hypertension only); both titled "NIFEDIPINE TABLET, EXTENDED RELEASE" | the brand only |
| Diltiazem | ER 120 mg capsules | once a day, 59 labels (hypertension, angina) / twice a day, CARDIZEM SR's kind, 10 labels (hypertension only); titled alike | a marker, sometimes: CD, XT, 24HR against SR, 12HR |
| Cyclosporine | 25, 100 mg capsules | "modified" (NEORAL, GENGRAF and generics: also rheumatoid arthritis, psoriasis), 9 labels / SANDIMMUNE and 3 generics (transplant only); not interchangeable, and generics of both titled "CYCLOSPORINE CAPSULE" | the word MODIFIED, or the brand |
| Fluoxetine | 10, 20 mg tablets | Prozac's generics, 29 labels (depression, OCD, bulimia, panic) / one label, Torrent's, SARAFEM's use (PMDD only) | the brand only |
| Semaglutide | 1.5, 4, 9 mg tablets | OZEMPIC tablets, as RYBELSUS (type 2 diabetes) / WEGOVY tablets (weight, heart risk with obesity) | the brand, always printed (no generics) |

## 2. A brand's own label that says something else

Not a split among generics: the brand's own label, at a strength and form its
generics share, lists other uses. Shown for a generic bottle it leaves uses
out, or adds them.

| Medicine | Strength and form | The brand's label | The generics' |
| --- | --- | --- | --- |
| Gabapentin | 600 mg tablets | GRALISE (once a day): postherpetic neuralgia only | also epilepsy |
| Propranolol | ER 80, 120 mg capsules | INDERAL XL: hypertension only | also angina, migraine |
| Alendronate | 70 mg tablets | BINOSTO (effervescent): no Paget's disease | also Paget's |
| Rivaroxaban | 2.5 mg tablets | XARELTO's one label for every strength: also atrial fibrillation, blood clots | the 2.5 mg strength's own: heart and artery disease only |
| Methylphenidate | ER 20 mg tablets | QUILLICHEW ER: ADHD only | also narcolepsy |
| Ibuprofen (OTC) | 200 mg capsules | ADVIL MIGRAINE: migraine | minor aches and pains |
| Cetirizine (OTC) | 5, 10 mg tablets; 10 mg capsules | "HIVES RELIEF" products: hives | hay fever |

## 3. Text that is not the label's own uses

The worst kind: 51 labels, all approved, all passing every check the app makes
today (ingredient, strength, route, salt, release, kind), because their
products really are the medicine; only the text is wrong. 30 of them are one
repackager's (DIRECT RX).

- **Another drug's uses (2):** acetaminophen/codeine (RedPharm) with
  lorazepam's (anxiety); carvedilol 3.125 mg (DIRECT RX) with finasteride's
  (enlarged prostate).
- **One product's uses on a label of two (6), all DIRECT RX:** metoprolol
  succinate ER with tartrate (the tartrate's: no heart failure); lisinopril
  with lisinopril/HCTZ; amlodipine with amlodipine/benazepril; amoxicillin
  with amoxicillin/clavulanate; sildenafil 20 mg with 50 mg (pulmonary
  hypertension, for the erectile dysfunction strength); acyclovir 800 mg with
  valacyclovir (valacyclovir's, cold sores among them, for acyclovir).
- **Another release's text, on products coded and titled as immediate-release
  (11), at a strength an immediate-release product also has:** verapamil
  120 mg (5 labels: extended-release's hypertension only, for a bottle whose
  uses include angina and arrhythmias); venlafaxine 75 mg tablets (2: adds
  social anxiety disorder); naproxen 375, 500 mg (3: delayed-release's, no
  pain or gout); oxycodone 10, 20 mg (1, Ranbaxy, "CONTROLLED-RELEASE" in its
  title, a word the app's release rule does not read: "around-the-clock ...
  for an extended period" for an immediate-release opioid). The app tries
  titles that name no release first, so these come first. 56 more like them
  are at strengths only the extended product has, where the text is right.
- **Not uses (14):** a celecoxib label's boxed warning; a valproic acid
  label's highlights boilerplate and boxed warning; gabapentin's medication
  guide; diazepam's pharmacology (2); cetirizine's and
  loratadine/pseudoephedrine's warnings; loratadine's and an OTC naproxen's
  directions; losartan/HCTZ cut off at "indicated for:" (4); an OTC
  ibuprofen's uses with its warnings run on.
- **Only "•" (18), all DIRECT RX:** levothyroxine (3), gabapentin (3),
  diclofenac (2), metformin, losartan, citalopram, amoxicillin, oxycodone,
  glimepiride, methocarbamol, benzonatate, celecoxib, ibuprofen. The app would
  show "•" as what the medicine is approved to treat.

Not a risk: 214 labels with no Indications section (83 of them Zydus's), which
the app skips.

Related, by the app's matching: a label's ingredient is accepted by its active
moiety as well as its substance. HORIZANT is gabapentin enacarbil, a different
drug that becomes gabapentin; its label names gabapentin as the moiety and in
its title, so it passes as gabapentin, and at ER 300 and 600 mg it is the only
gabapentin label titled extended-release: a once-a-day gabapentin bottle that
prints ER (GRALISE's generic, postherpetic neuralgia) would be shown
HORIZANT's, restless legs syndrome among them. Valacyclovir labels (127 in
acyclovir's DailyMed list) pass acyclovir's ingredient check the same way;
their titles keep them out.

## 4. Where the release decides, and is not read

Immediate- and extended-release labels at one strength and form, with
different uses. Where the bottle's release is read, the app tells them apart;
where it is not (not printed, or the marker missed), it tries immediate-release
titles first, by design (the header of `approved-uses.ts`), so an extended-release
bottle is shown the immediate-release product's uses.

| Medicine | Strengths | Differs |
| --- | --- | --- |
| Clonidine | 0.1 mg tablets | ER: ADHD only; immediate: hypertension only |
| Metoprolol | 25, 50, 100 mg tablets | ER (succinate) adds heart failure |
| Quetiapine | 50 to 400 mg tablets | ER adds depression (with an antidepressant) |
| Lamotrigine | 25 to 250 mg tablets | ER lacks bipolar disorder |
| Alprazolam | 0.5, 1, 2 mg tablets | ER lacks generalized anxiety |
| Venlafaxine | 37.5, 75 mg tablets | ER adds social anxiety disorder |
| Ropinirole | 2, 4 mg tablets | ER lacks restless legs syndrome |
| Verapamil | 120 mg tablets | ER lacks angina, arrhythmias |
| Diltiazem | 120 mg tablets | ER adds hypertension |
| Naproxen | 375, 500 mg tablets | delayed-release lacks pain, gout, menstrual cramps |
| Diclofenac | 25, 50, 75 mg tablets | delayed-release (sodium) lacks pain, menstrual cramps, adds ankylosing spondylitis |
| Bupropion | 150 mg tablets | built: refused without the brand or XL |
| Gabapentin | 300, 600 mg tablets | see HORIZANT and GRALISE above |

## 5. Where the strength decides, and is not read

Where no strength is read, every strength's label is the medicine's to the
app. Tadalafil and bupropion refuse then; these do not:

finasteride (1 mg hair loss, 5 mg prostate); sildenafil (20 mg pulmonary
hypertension, 25 to 100 mg erectile dysfunction); rivaroxaban (2.5 mg artery
disease, 10 to 20 mg atrial fibrillation and clots); semaglutide (WEGOVY
25 mg); gabapentin (GRALISE 300 to 900 mg); diltiazem ER capsules (60, 90 mg
twice a day); clonidine ER (0.1 mg ADHD, 0.17 mg hypertension); cyclobenzaprine
(TONMYA 2.8 mg, fibromyalgia); norethindrone (0.35 mg contraception, 5 mg
acetate for bleeding and endometriosis); ethinyl estradiol/norethindrone (the
menopause strengths against the contraceptive).

## 6. One product, labels of different dates or carve-outs

The rest of the 343: the same product, whose labels list fewer uses because
some are older (empagliflozin and dapagliflozin without chronic kidney
disease; lisdexamfetamine without binge eating; meclizine's "motion sickness"
where the current label says vertigo) or because a generic carved out a
protected use (aripiprazole without Tourette's or autism irritability;
duloxetine without fibromyalgia; topiramate without migraine; naproxen
without juvenile arthritis). Not another medicine's uses, but the list may
lack one the product has. Repackagers' labels lag most.

## What would close each (not built)

1. **Brand-only products:** extend `BY_BRAND` to nifedipine ER, fluoxetine
   tablets and semaglutide tablets; for diltiazem ER 120 mg and cyclosporine,
   accept the marker or MODIFIED in place of the brand. The cost: a generic
   nifedipine ER or fluoxetine tablet bottle without its brand would get no
   uses at all.
2. **Brands' own labels:** show one only where that brand is printed.
3. **Text not its own:** refuse a label whose text names a release its title
   does not (and read CONTROLLED-RELEASE as one); whose text is a fragment, a
   warning, highlights, a guide, pharmacology or directions; whose products are
   of different ingredients, salts, releases or strengths' uses; or whose text
   names another drug and not its own. Match an ingredient by its substance,
   and by its moiety only for a salt of it.
4. **Release not read:** where the ingredient's immediate and extended labels
   at that strength differ, refuse rather than prefer immediate.
5. **Strength not read:** where the ingredient's strengths differ in uses,
   refuse, as tadalafil does.
6. **Out-of-date labels:** prefer the application holder's own label to a
   repackager's.

## What was built (2026-10-05)

All of 1 to 5, as decided: 1 for nifedipine ER, fluoxetine tablets,
semaglutide tablets, cyclosporine (MODIFIED stands in for the brand) and
diltiazem ER 120 mg (CD or XR stands in); 4 wherever RxNorm makes two
releases at the strength, asking the user which marker the bottle shows
rather than refusing; and the CONTROLLED-RELEASE title first. Two things
differ from the plan, both found by replaying every bottle below:

- 2 shows a label named for a product without that name printed where no
  label without one is found for the bottle: every loratadine 5 mg label is
  a CHILDREN'S something, and PERCOCET's 2.5 mg had only one generic, which
  fails its salt. Where a generic's label is found, as it is for GRALISE,
  INDERAL XL, XARELTO 2.5 mg and the rest of 2, the brand's own is not
  shown.
- 3's prodrug check lets a substance be its moiety with any counter-ion or
  solvent (atorvastatin's labels are of "ATORVASTATIN CALCIUM PROPYLENE
  GLYCOL SOLVATE"), keeping apart only a prodrug named otherwise
  (valacyclovir), gabapentin enacarbil and the isosorbide nitrates.

Then, after the replay below: every page of DailyMed's list is read, not
the first hundred (GABARONE's own label is 177th of gabapentin's); and a
label giving strengths of two products made at none of each other's
(sildenafil 20 mg, REVATIO's, and 25 to 100 mg, VIAGRA's; finasteride 1
and 5 mg) is refused as a label of two products: DIRECT RX's sildenafil 20
and 50 mg, with REVATIO's uses, the only one.

Not built: a check for another medicine's uses that names neither medicine
(2 labels); none was found that did not also refuse amitriptyline's own
label, which names no medicine. Left so, as decided.

## What is still shown

The app's own lookup, today's and the new, replayed against DailyMed and
RxNav as the scan read them, for a clean reading of a typical pharmacy
bottle of every product of these medicines (1,078 products): the generic
name, salt, strength and form, the release marker where there is one, the
brand only where every label of the product is the brand's. Where the new
lookup asks the release marker, the user answers as the bottle is.

| | Most common bottle shows a label | All bottles |
| --- | --- | --- |
| Before | 158 of 195 | 973 of 1,078 |
| Built | 155 of 195: 142 at once, 13 after the question | 962 of 1,078: 65 after the question |
| And every page read | 155 of 195, as above | 1,006 of 1,078 |

The 13 asked first: metformin, oxycodone, glipizide, lamotrigine,
alprazolam, clonidine, naproxen, prednisolone, levetiracetam, oxybutynin,
verapamil, lovastatin, tacrolimus. The 3 lost are 1's nifedipine ER,
diltiazem ER and cyclosporine, refused without the brand (the model prints
no MODIFIED or CD, which real bottles may). Of all bottles, 13 found before
are not now: 8 of 1's; the DIRECT RX label of amlodipine with
amlodipine/benazepril, rightly; an isosorbide bottle the nitrates' split
refuses; and 3 whose brand is printed but whose own label is past the 100
DailyMed lists first, where before another product's label was shown. With
every page read, those 3 find their own, and 40 more bottles a label.

One window was left: of a list's likely labels, only the first 24 are
screened by their packaging for the strength printed, and screening all of
them would cost up to 263 packaging requests for one lookup in a hundred.
Instead, DailyMed's list for the exact product RxNorm says the bottle is
(its clinical drug: strength, form, release) is read first, its labels
needing no screening, and the ingredient's list only where none of them is
found. Replayed on a fresh fetch (tools/label-scan/, 2026-10-05; 1,071
bottles, so not comparable with the table above), against master:

| | Most common bottle | All bottles | Packaging requests per lookup, median / 99th / most |
| --- | --- | --- | --- |
| Master | 155 of 195 | 1,002 of 1,071 | 12 / 37 / 96 |
| Exact product first | 155 of 195 | 1,025 of 1,071, none lost | 0 / 26 / 35 |

Its first version showed GRALISE's generic, for nerve pain after shingles
alone, for an immediate-release gabapentin bottle: RxNorm names it
"Once-Daily gabapentin 600 MG Oral Tablet", read as released at once. Fixed
before it was merged, with tablets swallowed as they are read before those
chewed or dissolved. Of the 89 bottles shown another label, the rest are the
same uses in other words, a generic's label in place of a brand's
(LOPRESSOR, TIAZAC, LORTAB), or another edition of the same product's label
(an older oxycodone controlled-release text; potassium chloride's and
doxycycline's old-format sections): kind 6, left as decided.

Then, from the release build (2026-10-05): the vitamin D2 vial was shown a
repackager's label (Advanced Rx of Tennessee), not Torrent's, its maker's.
A repackager's label names the product it repackaged (`asEquivalentEntity`);
where that product's own label is listed and is the bottle's too, it is now
shown instead. Replayed against master: no bottle lost or gained a label;
of the labels shown, repackagers' fell from 424 to 37; 388 bottles are shown
another label, the same product's maker's (232 in the same words, the rest
the maker's newer or reformatted text, as fenofibrate's current label for
severe hypertriglyceridemia), for about one list request and one label
more where a repackager's is followed to its maker's. This closes part of
kind 6: a maker's label is current where its repackagers' lag.

33 of the 195 have no approved tablet or capsule label and show nothing by
name either way (inhalers, insulins, injections, creams, drops, unapproved
supplements; and lithium and valproate, whose labels name them lithium
carbonate, divalproex sodium or valproic acid, which do not match).

The first scan's scripts were kept in a temporary directory and lost with
it. The scan is now `tools/label-scan/` (fetch and replay, with how to rerun
them), its data in `tools/label-scan/data/`, which git ignores.
