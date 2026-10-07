# Privacy copy — the drafts the reviewer reviewed

**Reviewed and wired 2026-10-04** (`docs/reviews/copy-batch-followup-v4-2026-10-02-reviewed.csv`):
the strings below are in the app in the reviewer's Korean, which differs from these
drafts where the reviewer corrected them. Kept as the record of why each was written.
`settings.storageNotice`, whose "never sent anywhere" stopped being true, is
pending again (2026-10-05), with its draft in `copy-batch.draft.json`.

**Moved into the copy batch (2026-09-28).** Sections 1-3 are now the
`privacy.*` strings in `src/i18n/strings.ts`, drafted as below and reviewed in
the batch's follow-up sheet, with the gallery button's label
(`privacy.choosePhoto`) added. So one pass reviews them, not a separate one.
Section 4 is developer documentation in English, updated when the gallery
ships. This file stays as the reasoning behind them.

**Status:** drafted by the implementation, reviewed by nobody. **In the app in
English** since 2026-09-28, beside the gallery, which ships in release; the old,
inaccurate line no longer shows.

**Reviewer:** Korean reader. Unlike the sig phrases, no clinical knowledge is
needed — the question here is whether each sentence is *true* and whether an
elderly reader takes the intended meaning.

---

## Why this needs rewriting at all

The app currently promises:

> 사진은 저장하지 않아요. 글씨를 읽은 뒤 바로 지워요.
> *Photos are never saved. They are deleted right after the text is read.*

That was accurate while every image came from our own camera: the app created
the file, read it, deleted it. It stops being accurate the moment a user picks a
photo from their gallery, because that file is **theirs** — we must not delete
it, and saying we do would be both false and alarming.

The underlying promise has not changed, though. "We delete photos" was only ever
the *mechanism*. The actual guarantee is:

> **The image is never kept and never sent. Only the words on it are used.**

That is true of both paths, by different means. So the copy should state the
guarantee and let each path explain its own mechanism.

---

## 1. Top-level privacy line

Shown on the home screen. Replaces `home.privacy`.

| | |
| --- | --- |
| **Current** | 사진은 저장하지 않아요. 글씨를 읽은 뒤 바로 지워요. |
| **Draft** | 사진은 저장하지도, 다른 곳으로 보내지도 않아요. 글씨만 읽어서 쓰고 사진은 남기지 않아요. |
| **Intended meaning** | Photos are neither saved nor sent anywhere. Only the writing is read and used; the photo is not kept. |

Notes for the reviewer:

- `보내지도 않아요` ("nor sent") is new and deliberate. Not transmitting is the
  stronger and less obvious promise, and it is the one a user worried about a
  medical app would actually want.
- Is two sentences better than one long one here? The draft split it so each
  clause can be read alone.

## 2. Gallery-specific line

Shown when choosing an existing photo. New string.

| | |
| --- | --- |
| **Draft** | 고르신 사진은 그대로 둬요. 글씨만 읽고, 사진은 지우지 않아요. |
| **Intended meaning** | The photo you chose is left as it is. We only read the writing, and we do not delete your photo. |

Notes for the reviewer:

- **The "we do not delete" clause is the point of this string.** A user who has
  read that the app "deletes photos after reading them" may reasonably fear it
  will delete *theirs*. This reassures in the opposite direction from the usual
  privacy line, which is unusual enough to be worth checking reads correctly.
- ⚠ Does `그대로 둬요` clearly mean "left untouched", or could it be read as
  "left lying around" — which would be the wrong reassurance entirely?

## 3. Camera permission string

In `app.json`, shown by the OS when camera access is first requested.

| | |
| --- | --- |
| **Current** | 약병의 글씨를 읽기 위해 카메라를 사용합니다. 사진은 저장하지 않습니다. |
| **Draft** | 약병의 글씨를 읽기 위해 카메라를 사용합니다. 사진은 저장하거나 보내지 않습니다. |

Notes for the reviewer:

- Register differs from the rest of the app on purpose: 합니다체 rather than
  해요체, because this appears in a system dialog alongside the OS's own
  formal wording. **Is that right, or should it match the app?**
- Only the second sentence changed, for consistency with §1.

## 4. README privacy section

Developer-facing English, not user-facing. Needs updating for accuracy but not
for tone — flagged here so it travels with the batch rather than being
forgotten.

Current text says photos are "deleted immediately after extraction", which
should become something like: *images from the camera are deleted immediately;
images chosen from the library are read and left untouched; in neither case is
the image stored by the app or transmitted anywhere.*

---

## What is deliberately **not** changing

The `camera.privacyBanner` shown over the live preview — 사진은 저장되지 않아요
— stays as it is. It appears only on the camera path, where it remains exactly
true, and narrowing it would make it vaguer for no gain.

---

## After sign-off

The strings are already wired, in English (2026-09-28): `privacy.home` in place
of `home.privacy`, `privacy.pickedPhoto` in place of "the photo has been
deleted" under a reading of a chosen photo, `privacy.choosePhoto` on the
button, and the gallery out of its `__DEV__` gate. What is left:

1. Replace each `untranslated()` call in `src/i18n/strings.ts` with the reviewer's Korean.
2. Copy `privacy.cameraPermission`'s Korean into the camera permission in
   `app.json` (a test fails until the two match).
3. Update the README privacy section.
