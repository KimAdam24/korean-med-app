# What development builds have that a release must not

Audited 2026-09-28 against a real release build. "Compiled out" means the code
is not in the release bundle at all: checked by searching the bundle for
strings only that path contains (`scripts/check-release.py`), with shipped
copy found by the same search as a control. "Present" means it ships, and why
it cannot do harm.

## Compiled out of release

Gated on `__DEV__`, which Metro replaces with `false` in a release bundle, so
the minifier removes the code behind it.

| Path | What it exposes in a development build | Where |
| --- | --- | --- |
| Raw OCR panel, bottom of the result screen | Every line read, **unredacted**: the patient's name and address | `app/camera.tsx` `RawLinesPanel`, `ocr/dev-line-list.tsx` `DevLineList` |
| Captured-frame panel | The photo itself as a preview, and its file path (also needs `EXPO_PUBLIC_DEV_CAPTURE_PREVIEW=1`) | `app/camera.tsx`, `capture/dev-capture-probe.ts` |
| Gallery entry, "Choose a photo (pending copy review)" | **The real, finished gallery picker**, not tooling: held back from release until `content-drafts/privacy-copy.draft.md` is signed off (the current privacy line is untrue of the user's own photos), and it needs a reviewed button label too | `app/index.tsx` |
| File probe, bottom of the home screen | Reads a picked file and shows its lines unredacted; "Seed a sample medicine" and "Add this to my medicines" write to the list | `ocr/dev-file-probe.tsx` |
| Reading log | Each reading's lines to Metro and the device log, **redacted**: anything not evidently label text in shape only (`log-redaction`) | `ocr/dev-line-list.tsx` `logRecognizedLines` |
| Sweep replay button and picker | Starting a replay from files | `app/camera.tsx` |
| Replay frame log | Every replay frame's lines, redacted, once at the end; only frames the native view marked as a replay's | `ocr/sweep/replay-log.ts` (compiled out since `2f1a2d9`; before, it shipped and refused at run time) |
| Replay list | The names of files in the replay folder (`listReplays()` returns `[]`) | `modules/label-sweep/index.ts` |

The on-screen panels are unredacted by design (they stay inside the app, for
checking a reading against the bottle); the logs are redacted. **All of them
are in every development build**, including one used for a demo: record from
a synthetic label, or do not scroll to the bottom of the result screen.

## Present in release, and why that is safe

| Path | What it does | Why it cannot do harm in release |
| --- | --- | --- |
| Sweep replay, native (`SweepReplay.kt`, the `replay` prop, `replays()`) | Reads frames from the app's `sweep-replay` folder | Refuses unless the app is debuggable, and the release manifest is not (checked); JavaScript never passes a replay in release |
| Replay log lines, native (`LabelSweep` tag) | A replay's file name and frame counts, no text | Only on the replay path, which never runs in release |
| Imported-photo reading (`/camera?imageUri=`) | Reads the named photo, then deletes it | Reachable only by a deep link in release (the gallery entry is compiled out); reads and deletes only a file directly inside the picker's cache folder (`isPickedCopy`, since `d2821c3`: it used to accept `…/ImagePicker/../../<any file>`), and that folder is emptied at every launch |
| `DoseAlarms` error log | The name of the system event after which reminders could not be re-armed, and the exception | No medication data |
| Development launcher and menu (`expo-dev-client`) | — | Release builds use their `disableInRelease` stubs |
| `src/features/ocr/eval/report.ts` | Prints the evaluation report | A command-line script; nothing in the app imports it |

## To check it yourself

    python scripts/check-release.py android/app/build/outputs/apk/release/app-release.apk

and, for a minified build, with `--mapping android/app/build/outputs/mapping/release/mapping.txt`.
Anything new that is development-only should add its own strings to the
checker's list.
