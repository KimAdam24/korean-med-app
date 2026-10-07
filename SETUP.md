# Setting up on Windows

This is everything needed to build and run the app on a Windows
machine from nothing, including the parts that went wrong the first time, so
they don't go wrong for you. It ends with the app running on an Android
emulator, then a release build.

Commands are for PowerShell. The versions are the ones on the machine the app
has been built on. Where something must be exactly that version, it says so.

## 1. Node 22.23.1, through nvm

The project pins Node **22.23.1** (`.nvmrc`, and `eas.json` for cloud builds).
Use exactly that, so `package-lock.json` is written by the same npm that will
install from it.

1. Install **nvm for Windows**. The machine this was built on has version
   2.0.1, installed for one user under
   `%LOCALAPPDATA%\Author Software\nvm`.
2. In a new terminal:

       nvm install 22.23.1
       nvm use 22.23.1

3. Check:

       node -v            # v22.23.1

   If it shows another version, another Node is probably installed some
   other way (the installer from nodejs.org, Chocolatey, the Windows Store).
   `(Get-Command node -All).Source` lists every `node.exe` Windows can find.
   Remove the others.

**"NVM blocked package-manager execution".** nvm 2 runs `node`, `npm`, `npx`
and every globally installed command through small stand-in programs
("shims"), and it checks that the script behind each one is the one it
trusted. When that script changes, it refuses to run it:

    NVM blocked package-manager execution because a delegated command could
    not be trusted… Reason: delegated script changed since it was trusted…
    Event code: NVM4306

The fix:

    nvm reshim

(or `nvm doctor --autofix`), then run the command again.

**It comes back every time Claude Code updates itself.** Claude Code is
installed with npm, so it has a shim of its own, and each automatic update
changes the script behind it. Expect to run `nvm reshim` again after one.

**Switching Node versions.** Globally installed npm packages belong to one
Node version. After `nvm use` with a different version, install Claude Code
again under it, or `claude` is missing or still the old version's:

    npm install -g @anthropic-ai/claude-code

## 2. Java: Temurin JDK 21, not Android Studio's

Install **Eclipse Temurin JDK 21** from adoptium.net (here:
`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`).

Android Studio brings its own Java (version 25 at the time of writing). The
build fails with it at the CMake step, where the native code is compiled. So
point the build at Temurin 21 instead, with `JAVA_HOME` (next section). If
you ever build from inside Android Studio, set *Settings › Build, Execution,
Deployment › Build Tools › Gradle › Gradle JDK* to the same JDK.

    java -version      # openjdk version "21..."

## 3. Android Studio, the SDK, and two environment variables

Install **Android Studio**. You need it for the SDK and the emulator; the
app itself is built from the command line.

In Android Studio, open *SDK Manager*. On the machine this was built on:

- *SDK Platforms*: Android API 36 and API 37
- *SDK Tools*: Android SDK Build-Tools (35 and 36), NDK (Side by side)
  27.1.12297006, CMake 3.22.1, Android Emulator, Android SDK Platform-Tools

If the first build wants a different NDK or CMake version, it names it. Install
that one from the same screen.

Then set two **user** environment variables, and add one folder to `PATH`:

| Variable | Value |
| --- | --- |
| `JAVA_HOME` | the Temurin folder, e.g. `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot` |
| `ANDROID_HOME` | `%LOCALAPPDATA%\Android\Sdk` |
| `PATH`, add | `%ANDROID_HOME%\platform-tools` (that's where `adb` is) |

Open a new terminal and check:

    $env:JAVA_HOME
    $env:ANDROID_HOME
    adb version

## 4. An emulator: a Pixel 7 on API 37

In Android Studio's *Device Manager*, create a **Pixel 7** with an **API 37**
system image. That is the device the app has been tested on (`Pixel_7`).

**Start it before building.** The build installs onto a running device and
does not reliably start one itself:

    & "$env:ANDROID_HOME\emulator\emulator.exe" -avd Pixel_7

Wait for its home screen, then check:

    adb devices        # emulator-5554   device

## 5. The project

    git clone https://github.com/KimAdam24/korean-med-app.git
    cd korean-med-app
    npm install

The checks run without a phone or an emulator. They should all pass before
you change anything:

    npm run typecheck
    npm run lint
    npm run test:unit
    npm run test:integration

## 6. Generate the Android project: prebuild, without `--clean`

`android/` is not in git. It is generated from `app.json`, the config plugins,
`assets/fonts` and `modules/`:

    npx expo prebuild --platform android

Run it again whenever one of those changes. That includes a pull that touched
`app.json`, the fonts or a native module: the fonts are only embedded at this
step, so skipping it leaves the app in the phone's own font.

Run it **without `--clean`**. `--clean` deletes `android/` first, and with it
everything already compiled there, so the next build starts from nothing.

Treat `android/` as disposable either way. Prebuild may also replace it
wholesale on its own if it thinks the folder is malformed. Never keep
anything there (`docs/release-build.md` has the story).

## 7. A development build

With the emulator running:

    npx expo run:android

The first build takes a while (the native code compiles). It installs the app
and starts the development server. After that, JavaScript changes reload
without rebuilding. If you closed the server, start it again with
`npx expo start`. On the emulator, the server is reached at
`http://10.0.2.2:8081`.

Expo Go will not run this app: it has its own native modules, so it needs this
development build.

## 8. A release build

**Close the emulator first.** A release build compiles every CPU architecture
and bundles the JavaScript. With the emulator open as well, the machine runs
out of memory partway through.

    cd android
    .\gradlew.bat app:assembleRelease
    cd ..

Then start the emulator again and install:

    adb install -r android/app/build/outputs/apk/release/app-release.apk

`docs/release-build.md` has what to check once it's running.

**"Signatures do not match."** If an install fails with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` and something about signatures, the app
on the emulator was signed with a different key: built on another machine, or
by EAS. Uninstall it, then install again:

    adb uninstall com.togurt5.koreanmedassistant

That deletes the app's data on the emulator: its PIN and saved medicines.

## 9. iOS

There is no iOS build on Windows. The app is compiled for the iOS simulator on
EAS (Expo's cloud builds), with the profile in `eas.json`:

    npx eas-cli build --platform ios --profile ios-simulator

That needs access to the Expo project, which belongs to the `togurt5`
account. Ask the project owner to add you. The free plan has a monthly build limit, so
don't start one casually.

## Things that look broken and aren't

- **Screenshots of the app come out black,** on the emulator too. The app
  blocks screen capture on purpose, so the app switcher never shows a
  medicine list (`src/features/security/screen-privacy.ts`).
- **A grey box behind some text** after you've typed on the laptop
  keyboard. That's Android's keyboard-focus highlight: the emulator stops
  being in touch mode when it gets keyboard input. Click the screen once and it
  goes.
- **English mixed into the Korean.** Strings waiting for review show English
  until they're reviewed, and a few are shown in Korean completed by AI, with
  their English under them. That's the review pipeline (README, "Korean that
  has not been reviewed says so").

## Before you change things

The README explains what the app does and why it is built the way it is. Three
rules matter from day one:

- **No real label photo, or text read from one, ever goes into the repo.**
  Labels carry the patient's name, address and prescription number. The
  test corpus keeps only readings redacted in shape (every letter X, every
  digit 0). `src/features/ocr/eval/corpus.ts` says how.
- **Medical facts come only from the FDA label or RxNorm,** quoted and
  attributed, never written by hand or generated.
- **Korean wording goes through review.** New copy is written with
  `untranslated()` in `src/i18n/strings.ts`, and reaches the reviewer through
  `npm run copy:pending -- --export batch.csv`. Safety warnings are written
  by the reviewer, never drafted.
