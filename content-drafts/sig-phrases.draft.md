# Sig phrase library — DRAFT, UNREVIEWED

**Status:** drafted by the implementation, reviewed by nobody. Not imported by
the app. Do not ship.

**Reviewer needed:** Korean-speaking pharmacist, or a translator working with
one. The question for each row is not "is this good Korean" but "if a patient
did this, would that be correct".

---

---

## ⚠ REVIEWER: START HERE — the "UP TO N" problem

One row in this document is more dangerous than the rest, and it should not be
approved in the same pass as the others.

> `UP TO 3 TIMES DAILY` → draft: `하루 세 번까지`

English `UP TO N` states a **ceiling**: three is the most you may take, and
fewer — or none — is correct. Misread as a **schedule**, it becomes an
instruction to take three doses a day, every day. For a PRN medicine that is a
straightforward overdose, arrived at by following the app.

The draft's `까지` is intended to carry "no more than". The drafter is not
confident it does so unmistakably to a tired, elderly reader who may be scanning
rather than parsing.

**Specific questions for the reviewer:**

1. Does `하루 세 번까지` read as a limit, or could it be taken as a plan for the
   day?
2. Is an explicit prohibition safer — e.g. adding `그보다 더 드시면 안 돼요`
   ("you must not take more than that")?
3. Should the ceiling and the as-needed condition be **one** statement rather
   than two? `필요할 때만` (only when needed) and `세 번까지` (up to three times)
   are doing related work, and separating them may weaken both.
4. Is there a standard phrasing used on Korean pharmacy labels for a PRN
   maximum? Matching existing convention would beat anything invented here.

This row appeared on the first real label tested, so it is common rather than an
edge case. Please treat it as its own decision.

---

## How this is meant to work

US dispensing instructions are formulaic. A small set of patterns covers most
prescriptions, which is what makes a reviewed phrase library possible where free
machine translation is not: every string a user reads has been approved in
advance, rather than generated at the moment they need it.

Matching is on the **pattern**, not the whole sentence. `TAKE 1 TABLET BY MOUTH
TWICE DAILY` is three independent parts — quantity, route, frequency — and
composing reviewed fragments covers far more real sigs than listing whole
sentences would.

**Anything unmatched is shown in English, untranslated.** That is the rule that
makes this safe: a sig the library does not recognise must never be paraphrased
into something close.

### Register

해요체 throughout, matching `src/i18n/strings.ts` — polite and plain, without the
stiffness of 하십시오체. The reader is elderly and may be tired or unwell; the
sentence should be short enough to hold in one breath.

### Confidence markers

- (no marker) — drafter is reasonably confident, still needs sign-off
- `?` — drafter is unsure; expect to rewrite
- `??` — drafter thinks this may be wrong or dangerous to phrase this way

---

## 1. Quantity

| # | English | Draft Korean | Notes |
| --- | --- | --- | --- |
| Q1 | TAKE 1 TABLET | 한 알을 드세요 | |
| Q2 | TAKE 2 TABLETS | 두 알을 드세요 | |
| Q3 | TAKE 3 TABLETS | 세 알을 드세요 | |
| Q4 | TAKE 1/2 TABLET | 반 알을 드세요 | ? Splitting is a physical instruction; may need "쪼개서" |
| Q5 | TAKE 1 CAPSULE | 한 캡슐을 드세요 | |
| Q6 | TAKE 1 TEASPOONFUL | 한 티스푼을 드세요 | ?? 5mL. A kitchen teaspoon is not 5mL — is a volume safer? |
| Q7 | TAKE 5 ML | 5밀리리터를 드세요 | |

Korean counts pills with 알 and capsules with 캡슐. Numerals above three:
propose digits (`4알`) rather than native numerals, for legibility at a glance —
**reviewer to confirm**.

## 2. Route

| # | English | Draft Korean | Notes |
| --- | --- | --- | --- |
| R1 | BY MOUTH | 입으로 | Often omittable in Korean; see note below |
| R2 | BY MOUTH (oral, implied) | *(omit)* | ? Korean sigs usually leave oral route implicit |
| R3 | APPLY TO AFFECTED AREA | 아픈 부위에 바르세요 | |
| R4 | INSTILL IN EYE(S) | 눈에 넣으세요 | ?? Which eye matters clinically — left/right must survive |
| R5 | INSTILL IN EAR(S) | 귀에 넣으세요 | ?? Same concern as R4 |
| R6 | INHALE | 들이마시세요 | |
| R7 | INJECT SUBCUTANEOUSLY | 피하에 주사하세요 | ? Technical; is a plainer phrasing safe here |

**Open question for the reviewer.** Omitting "by mouth" reads more naturally in
Korean, but this app's user may be holding several medicines, not all oral. The
draft's instinct is to keep the route explicit whenever the profile contains
anything non-oral — that is a product decision as much as a translation one.

## 3. Frequency

| # | English | Draft Korean | Notes |
| --- | --- | --- | --- |
| F1 | ONCE DAILY | 하루 한 번 | |
| F2 | TWICE DAILY | 하루 두 번 | |
| F3 | THREE TIMES DAILY | 하루 세 번 | |
| F4 | FOUR TIMES DAILY | 하루 네 번 | |
| F5 | EVERY 4 HOURS | 4시간마다 | |
| F6 | EVERY 6 HOURS | 6시간마다 | |
| F7 | EVERY 8 HOURS | 8시간마다 | |
| F8 | EVERY 12 HOURS | 12시간마다 | |
| F9 | AT BEDTIME | 자기 전에 | |
| F10 | IN THE MORNING | 아침에 | |
| F11 | EVERY OTHER DAY | 이틀에 한 번 | ? Literally "once per two days" — confirm this is unambiguous |
| F12 | WEEKLY | 일주일에 한 번 | |
| F13 | UP TO 3 TIMES DAILY | 하루 세 번까지 | ?? **See the flagged section at the top of this document — do not approve in a routine pass** |

`UP TO N` (F13) is called out separately at the top of this document. It is the
one row here whose failure mode is an overdose rather than a confusion.

## 4. Conditions and timing

| # | English | Draft Korean | Notes |
| --- | --- | --- | --- |
| C1 | WITH FOOD | 식사와 함께 | |
| C2 | AFTER MEALS | 식사 후에 | |
| C3 | BEFORE MEALS | 식사 전에 | |
| C4 | ON AN EMPTY STOMACH | 빈속에 | |
| C5 | WITH A FULL GLASS OF WATER | 물을 충분히 마시면서 | ? "Full glass" is specific; does 충분히 lose that |
| C6 | AS NEEDED | 필요할 때만 | 만 marks it as optional, not scheduled |
| C7 | AS NEEDED FOR PAIN | 아플 때만 | |
| C8 | AS DIRECTED | 의사 지시대로 | ?? Says nothing useful. Consider refusing to translate |
| C9 | DO NOT CRUSH OR CHEW | 씹거나 부수지 마세요 | |
| C10 | TAKE UNTIL FINISHED | 다 드실 때까지 계속 드세요 | Antibiotics; stopping early matters |

**C8 is the draft's biggest concern.** `AS DIRECTED` carries no information — it
means the instruction is somewhere else, usually a conversation the patient had.
Translating it produces a Korean sentence that sounds like guidance and is not.
The draft's recommendation is to show it untranslated in English and flag it,
rather than render it. **Reviewer to decide.**

## 5. Composition

Parts join in Korean order: **frequency → condition → quantity**, which inverts
the English.

> `TAKE 1 TABLET BY MOUTH THREE TIMES DAILY WITH FOOD`
> → `하루 세 번, 식사와 함께 한 알을 드세요.`

> `TAKE 1 TABLET BY MOUTH UP TO 3 TIMES DAILY AS NEEDED. TAKE WITH FOOD.`
> → `하루 세 번까지, 필요할 때만 한 알을 드세요. 식사와 함께 드세요.`

The second is the real sig from the first tested label. **Reviewer: is one
sentence better than two here?** The draft split it because the English did, but
Korean may prefer a single clause.

---

## What this draft does not cover

- **Tapering schedules** ("2 tablets for 3 days, then 1 daily"). Common with
  steroids, and composing them from fragments risks producing a schedule nobody
  prescribed. Recommend English-only until designed deliberately.
- **PRN with a maximum** ("no more than 8 in 24 hours"). The ceiling is the
  safety-critical part and deserves its own review pass.
- **Anything with a laterality** — left/right eye or ear. Getting this wrong has
  a direct physical consequence.
- **Non-oral routes** beyond R3–R7.

These are listed so their absence is a decision rather than an oversight.
