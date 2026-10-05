# Label scan

A regression check for the approved-uses lookup (`findApprovedUses` in
`src/features/drugs/approved-uses.ts`). It fetches, once, every DailyMed label
of the top 200 prescribed medicines and RxNorm's products for them, then
replays two versions of the app's own lookup against that data, for a bottle
of every product, and says what changed between them.

Rerun it whenever the label rules change: anything in `approved-uses.ts` or
`identify-name.ts` that decides which label is shown, or whether one is.
Checks of a few hand-made labels (the unit tests) have twice missed what this
found: a narrowed ingredient match refused atorvastatin's own labels, and a
strict release rule refused GRALISE's.

The findings of the first scan, and what was built from them, are in
`docs/label-scan.md`.

## Running it

```sh
npm run label-scan:fetch                      # fetch what is missing (all steps)
npm run label-scan:replay                     # HEAD against the working tree
npm run label-scan:replay -- --before master --after my-branch
```

The fetch keeps everything in `tools/label-scan/data/`, which git ignores.
Each step saves as it goes and, run again, fetches only what is missing, so
an interrupted fetch is resumed by running it again. A step's data can be
fetched afresh for a new baseline:

```sh
npm run label-scan:fetch -- labels --refresh
```

The steps, in order: `top` (ClinCalc DrugStats' Top 300, from MEPS),
`identify` (each name as the app identifies a printed one, `identifyByName`),
`lists` (DailyMed's list for each medicine's RxNorm code, every page, by
prescription and over-the-counter), `clinical` (RxNav's clinical drugs for
each), `products` (DailyMed's list for each tablet and capsule clinical drug)
and `labels` (every listed label titled a tablet or capsule). The whole fetch
is about 37,000 requests and takes hours; `labels` is most of it.

A label is kept small (`reduce` in `shared.ts`): its kind, its approvals, its
products and its Indications and Usage section, as the XML has them, and none
of the rest. Any version of `readIndications` reads that as it reads the
whole, so old and new code are replayed on the same labels.

The replay takes a ref's `src/` out of git into `data/refs/` and imports its
lookup from there; the working tree's is imported in place. It writes
`data/replay-<before>-to-<after>.txt` (and `.json`, every bottle's outcome)
and prints the summary.

## What it checks

For each identified medicine, each product of its approved tablet and capsule
labels (a form, release, strength and salt) is one bottle, read cleanly from a
pharmacy label: its generic name and salt, strength and form, its release
marker where it has one, its brand only where every label of the product is a
brand's, prescription unless the product is only sold over the counter. The
bottle with the most labels is the medicine's most common one.

Each bottle is looked up by both versions, through `fetch` answered from the
fetched data (`stand` in `shared.ts`). Where a version asks which release
marker the bottle shows, the user answers it as the bottle is. The report
gives, for each version:

- how many medicines' most common bottle shows a label, and how many bottles
  of all;
- every lookup's outcome (found, none, refused and why), tallied;
- how many of the labels shown are a repackager's (its products another
  labeler's, `asEquivalentEntity`);
- requests per lookup (list pages, packaging summaries, labels downloaded,
  RxNav), at the median, 90th and 99th percentiles and the most;

and, between them, every bottle that lost its label, gained one, was shown
another label, or was refused for another reason.

Another label is not always other uses. To see whether the words shown
changed, and how much, least alike first:

```sh
node --experimental-strip-types --no-warnings --max-old-space-size=8192 \
  tools/label-scan/compare-texts.ts replay-<before>-to-<after>.json
```

A low share of words in common is where to look: it found the first version
of the exact-product lookup showing GRALISE's generic, for nerve pain after
shingles alone, for an immediate-release gabapentin bottle (RxNorm names it
"Once-Daily gabapentin 600 MG Oral Tablet", which was read as released at
once).

## What it does not

- It assumes a clean reading: no damaged or cut-off text, the strength and
  release marker read. MODIFIED (cyclosporine) and CD (diltiazem) are never
  printed, though real bottles may print them.
- DailyMed's packaging summaries are not fetched; the replay answers them from
  the label's own products' strengths.
- Only labels titled a tablet or capsule are fetched, the only forms looked up
  by name; a barcode's lookup is not replayed.
- Identification is the app's as it was at the `identify` step: a change to
  `identifyByName` needs `fetch identify --refresh` to be replayed.
- DailyMed changes every day. Compare two versions on the same data; numbers
  from different fetches are not comparable.
