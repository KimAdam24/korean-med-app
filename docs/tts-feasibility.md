# Reading aloud in Korean: what is actually possible

**Status:** groundwork only. Nothing is built; this is what any design has to
work within. Written 2026-09-25.

## The short version

Korean text-to-speech is available on both platforms, but **not guaranteed on
any given phone**, and the obvious library — `expo-speech`, Expo's own — **fails
silently when it is missing**: it quietly speaks with the phone's default voice
instead, and reports success. On a phone set to English, that is an English
voice reading Hangul, which comes out as silence or noise while the app believes
it is talking. By this project's own standard (a feature that fails silently is
worse than none) that rules out using it unmodified.

What would make it safe is small: an availability check that tells "Korean is
installed on this phone, on-device" from everything else. On iOS the library can
already answer that. On Android it cannot, and the check needs about thirty lines
of **Kotlin** — native code — or a patch to the library.

## How this was established

| Claim | Source |
| --- | --- |
| What `expo-speech` does | Its source, version 57.0.3 (the SDK 57 release): `android/.../SpeechModule.kt`, `ios/SpeechModule.swift`, read directly |
| The API surface | docs.expo.dev/versions/v57.0.0/sdk/speech |
| What the platforms ship | Platform documentation and behaviour, **not verified on a device**: the Android emulator was not running, there is no Mac here, and neither would say what the target phone has |

The last row matters most, and only a check on the actual phone settles it —
see "Before designing" below.

## Android

**Which voice speaks depends on the phone's default speech engine**, not on the
app: usually Google's Speech Services, but on Samsung phones often Samsung's own.
Both support Korean. Whether Korean voice data is *on the phone* is another
matter: Google's engine downloads languages on demand, and a US-region phone set
to English is unlikely to have Korean until someone installs it.

What `expo-speech` does with that, from its source:

- **Missing Korean falls back silently.** `speakOut` asks the engine
  `isLanguageAvailable(locale)`; on `LANG_MISSING_DATA` or `LANG_NOT_SUPPORTED`
  it sets `Locale.getDefault()` instead and speaks anyway. No error event.
- **`'ko-KR'` probably does not work.** The language string goes to
  `Locale(String)`, which takes a bare language code; `Locale("ko-KR")` is a
  language called "ko-kr", which the engine will not know, so the fallback
  above kicks in. `'ko'` is what it can use. Unverified on a device, but it
  follows from the constructor's contract.
- **The voice list includes voices that are not installed.**
  `getAvailableVoicesAsync()` returns `TextToSpeech.getVoices()` mapped to name,
  language and quality only. Android marks an undownloaded voice with the
  `notInstalled` feature and a cloud voice with `isNetworkConnectionRequired()`;
  neither is passed through. So a Korean voice in the list does not mean Korean
  can be spoken, now, offline.
- **A named voice that does not exist is ignored**, not reported.
- **No pause or resume.** Stop and start again only.

**Privacy.** Google's engine includes network voices, which send the text to
Google to synthesise. Reading out a medicine name that way would send it off
the phone — against this app's rule that nothing leaves the device but a
barcode number. Voices would have to be restricted to on-device ones, which the
library cannot tell apart (see above).

## iOS

**Korean voices are part of iOS** (Apple's compact "Yuna" and others),
on-device, with higher-quality versions the user can download in Settings →
Accessibility → Spoken Content → Voices → Korean. So iOS is the easier platform
— subject to the same on-device check.

What `expo-speech` does, from its source:

- **By language, missing Korean falls back silently:**
  `AVSpeechSynthesisVoice(language:)` returns `nil` and the system default voice
  speaks.
- **By voice identifier, a missing voice throws** (`InvalidVoiceException`). So
  on iOS, choosing a Korean voice from `getAvailableVoicesAsync()` — which lists
  only installed voices — and speaking with its identifier fails loudly, as it
  should.
- **The ring/silent switch mutes it** by default. Many older users keep the
  phone on silent to avoid calls interrupting; a "read aloud" button that is
  silent on a silent phone is the failure this project keeps designing out.
  Speaking regardless needs the app's audio session set to playback, which
  `expo-speech` alone does not do (its `useApplicationAudioSession` option only
  hands the choice to the app).

## Constraints that are not about voices

- **What could be read.** Only reviewed copy: the app's own Korean strings once
  the Korean reviewer has been through them, and the label's own English (drug name,
  strength) in an English voice. Directions in Korean need the translation work
  in §3.2, which is not built, and must come from authoritative sources. The
  rule for damaged OCR text carries over unchanged: text that is not shown as
  the answer is never spoken as the answer.
- **Mixed languages.** A Korean voice reads an English drug name with Korean
  phonetics, or letter by letter. Readable output means splitting the utterance:
  Korean parts in a Korean voice, the name in an English one, queued (Android
  queues with `QUEUE_ADD`; iOS queues on the synthesiser).
- **Rate.** Both platforms take a rate; slower than default (around 0.85) suits
  older listeners, to be tried with the actual listener.

## Before designing

Run a diagnostic on the phone it is for, which records:

- Android: the default engine's package; `isLanguageAvailable(Locale.KOREAN)`
  (installed / missing data / unsupported); every Korean voice with its
  `notInstalled` and network flags.
- iOS: every `ko` voice from `AVSpeechSynthesisVoice.speechVoices()`, with
  quality; and whether the silent switch mutes a test phrase.

That diagnostic needs `expo-speech` added (a native rebuild) and, on Android,
the Kotlin check above — so it is the first piece of native code this feature
would bring. It is a decision for you, and it is not started.

## If it goes ahead

A design that meets the no-silent-failure standard would, at minimum:

1. Offer "read aloud" only where a Korean on-device voice is confirmed, and say
   so plainly where it is not — with, on Android, the system's own "install
   voice data" screen (`ACTION_INSTALL_TTS_DATA`) as the way to fix it.
2. Speak by explicit voice, never by language alone.
3. Speak on a silent phone, or say that it cannot.
4. Never use a network voice.
5. Never speak text the screen does not show as the answer.
