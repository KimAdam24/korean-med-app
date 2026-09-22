# Privacy copy — DRAFT, UNREVIEWED

**Status:** drafted by the implementation, reviewed by nobody. **Not in the
app.** The gallery entry point is gated behind `__DEV__` until these are signed
off, precisely so the old, now-inaccurate line cannot ship beside the new
feature.

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

1. Move strings 1–3 into `src/i18n/strings.ts`.
2. Update the camera permission string in `app.json`.
3. Update the README privacy section.
4. Remove the `__DEV__` gate on the gallery entry point in `src/app/index.tsx`
   — that gate exists solely because this copy is unreviewed.
