# DailyMed section selection — DRAFT, UNREVIEWED

**Status:** drafted by the implementation, reviewed by nobody. Not wired to the
UI. Do not ship.

**Reviewer needed:** pharmacist, for the clinical selection; then a translator
for whatever survives it.

---

## The problem

`src/features/drugs/dailymed.ts` can fetch any section of an FDA label by LOINC
code. It deliberately does not decide which ones a user sees, because that is a
clinical judgement rather than an engineering one.

The constraint that shapes everything below: **an FDA label is written for
prescribers.** "Warnings and Precautions" for a common drug runs to several
thousand words of subsection-numbered prose. Shown to an elderly reader managing
six medicines, the practical outcome is that nothing is read — which is worse
than showing nothing, because it looks like the app informed them.

So the question is not "which sections are important" — they all are, to
somebody. It is **which sections change what this user does today.**

## Recommendation

| LOINC | Section | Draft verdict |
| --- | --- | --- |
| `34066-1` | Boxed Warning | **Show** |
| `34076-0` | Patient Counseling Information | **Show, condensed** |
| `43685-7` | Warnings and Precautions | **Do not show** |
| `34068-7` | Dosage and Administration | **Do not show** |
| `34070-3` | Contraindications | Undecided — see below |

### Boxed Warning — show

The FDA reserves this for risks that are life-threatening or require specific
monitoring. It is the only section written to be brief, most drugs have none at
all, and its presence is itself the signal. If exactly one section is ever
shown, this is it.

Typically 50–200 words. Translatable within a reviewed budget.

### Patient Counseling Information — show, condensed

The one section written *for the patient* rather than the prescriber, so the
register is already close to right. It is still long — often 400–800 words — and
the draft's proposal is to show it behind a tap rather than inline, and to
translate only the leading paragraphs.

**Open question:** condensing is editorial. Choosing which two of five
counselling points to translate is a clinical decision, and the draft is not
qualified to make it. Does the reviewer want to select per-drug, or agree a rule
(e.g. "first three bullets")?

### Warnings and Precautions — do not show

Length alone disqualifies it. It is also the section most likely to alarm
without informing: it lists every adverse effect observed in trials, at every
frequency, without the prescriber's context for weighing them. A patient reading
their own label's full warnings section frequently stops taking the drug, which
is the opposite of what this app is for.

Not proposing to hide it permanently — proposing that surfacing it needs a
design, not just a fetch.

### Dosage and Administration — do not show

The dose that matters to this user is on their own pharmacy label and comes from
OCR. The FDA section describes dosing across the whole population — renal
adjustment, paediatric ranges, titration — and a patient comparing it with their
own prescription may conclude their pharmacist made a mistake.

Actively risky to show. The draft recommends never showing it, not merely
deferring.

### Contraindications — undecided

Genuinely arguable. Short, specific, and occasionally decisive ("do not take if
pregnant"). But phrased for someone with the patient's full history, and a
reader who self-assesses against it may stop a drug they need.

**The draft has no recommendation here and would rather the reviewer decided.**

## Cross-cutting questions for the reviewer

1. **Attribution.** Every shown section should presumably be marked as coming
   from the FDA label rather than from this app. Proposed: `미국 FDA 허가사항에서
   가져온 내용이에요` — reviewer to confirm wording.

2. **No label found.** DailyMed only holds *current* labels, so a discontinued
   package — which this app deliberately still identifies — often has none. The
   draft proposes saying so plainly rather than silently showing nothing, since
   an absent warning and an unchecked one look identical otherwise.

3. **Translation budget.** Boxed warnings are drug-specific, so this cannot be a
   fixed phrase library the way sig text can. Options are per-drug reviewed
   translation for a starting formulary, or showing English with a Korean
   summary. Both are content programmes, not features. **This is the decision
   most likely to determine whether §3.2(b) is deliverable at all.**

4. **Staleness.** Labels are revised. If a translation is reviewed against
   revision N and the label moves to N+1, the app would be showing approved text
   that no longer matches the source. Needs a version check against `spl_version`
   and a rule for what to do when it moves.
