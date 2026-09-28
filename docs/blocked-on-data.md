# Three features blocked on data, not engineering

Written 2026-09-28. Three features are parked, and each one stopped at the same
point: the medical content the app would show has to come from an authoritative
source the app is allowed to use, and for each of the three there is no such
source available to this project today. The engineering is either done and
waiting on an empty table, or it would be small. In every case, what is
missing is permission to use the data or access to it.

| Feature | Code state | Blocked on | Parked |
| --- | --- | --- | --- |
| Interaction guidance (§3.4) | Engine built and tested; rule table empty | Licensing, **and** regulatory counsel | 2026-09-22 |
| "What this medicine is for", in plain words | Built instead in the label's own words (below) | Source availability: the only patient-language text is licensed | 2026-09-28 |
| Korean medicine names | Importer and display built; name table empty | Data access: a data.go.kr key the owner cannot obtain | 2026-09-28 |

The rule behind all three is the same: medical facts only from an authoritative
source, attributed on screen, never written from memory or generated. So the
answer to "can't we just fill it in?" is no, for all three. Plausible content
written from memory would look authoritative to a reader who cannot check it.
Preventing that is what this app is built to do.

## Interaction guidance (§3.4)

**What it would do:** warn when two of the user's saved medicines should not
be combined, attributed to its source.

**What is built:** `src/features/interactions/`. Matching runs over
ingredients, offline, and it reports which records it could not check instead
of passing them. `INTERACTION_RULES` in `rules.ts` is empty, and a test fails if
it is filled without that gate being considered.

**Why it is blocked:**

- **Licensing.** NLM withdrew its free interaction API on 2 January 2024 (see
  `types.ts`), so the remaining sources are a commercial licence or a
  published, curated list.
  - **CredibleMeds is off the table** (decided 2026-09-22). AZCERT's terms do
    not permit this use; `src/features/guidance/attribution.ts` records why.
    The comments in `rules.ts` and `types.ts` still describe it as a chosen
    source, and they are out of date on this point.
  - Whether the ONC high-priority list may be transcribed for this use is part
    of the licensing question that is still open.
- **Regulatory.** FDA's *Clinical Decision Support Software* guidance (issued
  29 January 2026) treats drug–drug interaction alerts as non-device CDS only
  when they go to a health care professional: "Software functions that support
  or provide recommendations to patients or caregivers – not HCPs – meet the
  definition of a device." This app's reader is the patient.

**What would unblock it:** an opinion from regulatory counsel, and a data
source whose licence covers showing it to patients. Until both exist, nothing
here changes.

## "What this medicine is for"

**What it would do:** one plain line per medicine, such as "for blood
pressure".

**What is built instead (2026-09-28):** the label's own words. The app shows
the Indications and Usage section of the medicine's FDA label from DailyMed,
verbatim and attributed, under a heading saying what it is and a note that it
is the approved indication, not the doctor's reason
(`features/drugs/approved-uses.ts`; see `docs/scope.md`). Accepted as
prescriber's English, and as wrong about why a user takes their vitamin D2. The
plain line, "for blood pressure", is what stays blocked, for the reasons
below. The research is in the gitignored `android/release-check/indications/`.

**Why it is blocked:**

- **The only patient-language source is licensed.** That source is
  MedlinePlus's "Why is this medication prescribed?" section. It is ASHP's
  *AHFS Patient Medication Information*, and each page says: "Duplication for
  commercial use must be authorized by ASHP." MedlinePlus's own terms add:
  "You may not ingest and/or brand the copyrighted content found on
  MedlinePlus in an EHR, patient portal, or other health IT system. To do so,
  you must license the content directly from the information vendor."
  - MedlinePlus Connect's API does return this paragraph, and its page says
    "You are welcome to link to and display the data returned by MedlinePlus
    Connect". But the API's documentation lists only a title, a URL and an
    attribution for drug lookups. Treat it as unusable until NLM or ASHP
    confirms in writing.
  - Linking to the MedlinePlus page is allowed. The page is in English.
- **The public sources are not patient text.**
  - **DailyMed.** The Indications and Usage section is written for
    prescribers.
    - For five common drugs it ran 25 to 485 words; the Highlights version
      runs 34 to 156 words.
    - The FDA-approved patient leaflet was present for only two of the five.
  - **RxClass.** Its short fields are either mechanism classes ("Biguanide")
    or unranked disease lists.
  - **식약처's e약은요.** Plain Korean, but it covers over-the-counter
    medicines only; none of the four prescription drugs checked had an entry.
  - **식약처's approved indications (허가 효능효과).** These cover
    prescription drugs, but:
    - they are written for prescribers;
    - they may only be shown verbatim ("내용에 대한 임의 가공 금지");
    - they describe Korean products, not the one in the user's bottle.
- **A caution that no licence fixes.** A label says what a drug is approved
  for, not why this person takes it. Every one of the 12 ergocalciferol
  (vitamin D2) labels sampled lists hypoparathyroidism, refractory rickets and
  familial hypophosphatemia, and none mentions deficiency. MedlinePlus says the
  same. Any design has to say that the doctor may have prescribed the medicine
  for another reason.

Regulation is **not** the blocker here. Showing approved-label text verbatim,
attributed and keyed to the drug rather than to the person, reads as patient
education and reference material. FDA's *Policy for Device Software Functions
and Mobile Medical Applications* puts that among "not devices" (item 3). That
is a reading of non-binding guidance, not legal advice.

**What would unblock it:** a licence from ASHP, or written confirmation from
NLM that Connect's drug summaries may be displayed in a patient app.

## Korean medicine names

**What it would do:** show 식약처's official Korean name for each ingredient
(레보티록신 beside levothyroxine), attributed to 식약처.

**What is built:**

- `scripts/import-mfds-names.ts` and `scripts/mfds-import.ts` (the pairing is
  conservative, and a report lists what was left out);
- `src/features/drugs/korean-names.ts`, which shows a name only when the table
  has one;
- `src/features/drugs/mfds-names.ts`, the table, generated and empty.

With the table empty, the app shows the English name alone, which is what the
bottle says.

**Why it is blocked:**

- 식약처 publishes these names only through data.go.kr OpenAPIs. All 73
  datasets on 식약처's own list (nedrug.mfds.go.kr, 공공데이터 제공안내,
  checked 2026-09-28) are OpenAPIs, and each needs a data.go.kr service key.
- The one that carries the names is 의약품 제품 허가정보
  (https://www.data.go.kr/data/15095677/openapi.do; fields `MAIN_ITEM_INGR`
  and `MAIN_INGR_ENG`).
- Signing up for data.go.kr requires verification with a Korean mobile number,
  which the owner does not have.

**Do not chase these:**

- **data.go.kr/data/15020627** was once cited here as 식약처's ingredient
  list. It is 63 rows of 2020 industry statistics, with no ingredient names.
  It was cited from a search result's title without being opened.
- **HIRA's 약가마스터 주성분 file** (data.go.kr/data/15067461) is a file
  download under 공공누리 제1유형. It came up on 2026-09-28 and was not opened.
  Nobody has checked whether it carries Korean names; do not assume it does.

**What would unblock it:**

- A data.go.kr key held by someone entitled to one.
- Then check two things in the importer before the first run:
  - its endpoint names version 06 of the service, and the current version is
    08 (old versions shut off 90 days after a new one);
  - its field names are still assumptions until a real response confirms
    them.
- `guidance.perMfds` in `src/i18n/strings.ts` is the attribution line for
  these names. It has nothing to label until then.

## The pattern

For each of these, the engineering left is small: filling a table, running an
importer, or one display component. None of them can be unblocked by writing
more code. Anyone picking one up
should start with the data question, not the engineering: who publishes the
source, and on what terms? For §3.4, also ask counsel.
