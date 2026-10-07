# Setting up

This is everything needed to build and run the app on a machine
from nothing, including the parts that went wrong the first time, so they
don't go wrong for the next person. It ends with the app running on an Android emulator,
then a release build.

**Windows** is sections 1 to 9. It is how the app has been built so far:
tested, every step. **A Mac** is [further down](#on-a-mac-untested): written
from current documentation, and untested, since no Mac was available to test
it on.

On Windows, commands are for PowerShell. The versions are the ones on the
machine the app has been built on. Where something must be exactly that
version, it says so.

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

    git clone <repository URL>
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

There is no iOS build on Windows: building for iOS locally takes a Mac (see
[On a Mac](#on-a-mac-untested)). From Windows, the app is compiled for the iOS
simulator on EAS (Expo's cloud builds), with the profile in `eas.json`:

    npx eas-cli build --platform ios --profile ios-simulator

That needs access to the Expo project, which belongs to the `togurt5`
account. Ask the project owner to add you. The free plan has a monthly build limit, so
don't start one casually.

## On a Mac (untested)

**Untested.** No Mac was available to test it on. On 2026-10-07 every command below was
checked against current documentation: Homebrew's installer, nvm's README,
Expo's setup guides, Android's emulator docs and Apple's developer docs. None
of them has been run. Where a step could not be confirmed in docs, it says so.
If something here turns out wrong, fix it here.

The steps match the Windows ones above. Commands are for zsh, the Mac's
default shell.

### Homebrew

    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

It ends with a "Next steps" list: run those commands. On Apple Silicon they
put Homebrew on your `PATH` (a `brew shellenv` line in `~/.zprofile`).

### Node 22.23.1, through nvm

    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash

The installer adds nvm to your shell profile (`~/.zshrc`). In a new
terminal:

    nvm install 22.23.1

In the project folder, a plain `nvm use` reads `.nvmrc`.

The NVM4306 shim error in section 1 is Windows-only: it comes from nvm for
Windows, and nvm on a Mac has no shims.

**Switching Node versions** is the same as on Windows: global packages belong
to one version, so install Claude Code again under the new one,

    npm install -g @anthropic-ai/claude-code

or carry every global package over as you install the new version:

    nvm install <new version> --reinstall-packages-from=22.23.1

### Java: Temurin JDK 21

    brew install --cask temurin@21

Then, in `~/.zshrc`:

    export JAVA_HOME=$(/usr/libexec/java_home -v 21)

Expo's guide suggests Zulu 17. The project builds with 21 on Windows, so use
21 here too.

### Android Studio, the SDK, and `ANDROID_HOME`

Install Android Studio. In *SDK Manager*, install the same packages as in
section 3. Then, in `~/.zshrc`:

    export ANDROID_HOME=$HOME/Library/Android/sdk
    export PATH=$PATH:$ANDROID_HOME/emulator
    export PATH=$PATH:$ANDROID_HOME/platform-tools

In a new terminal, `adb version` should answer.

### The emulator

In *Device Manager*, create a Pixel 7 on API 37. **On Apple Silicon (M1 and
later), choose the ARM64 system image (`arm64-v8a`).** Android's emulator docs
say ARM Macs need ARM images: an x86 image gets no hardware acceleration
there. On an Intel Mac, use x86_64.

Start it before building:

    emulator -avd Pixel_7
    adb devices

### The project, prebuild, and a development build

As in sections 5 to 7:

    npm install
    npx expo prebuild --platform android      # without --clean
    npx expo run:android

### A release build

Close the emulator first, as on Windows: the build needs the memory.

    cd android
    ./gradlew app:assembleRelease
    cd ..

Then start the emulator and install:

    adb install -r android/app/build/outputs/apk/release/app-release.apk

If the install fails because the signatures don't match, uninstall first. This
deletes the app's data on the emulator:

    adb uninstall com.togurt5.koreanmedassistant

### iOS in the simulator

- **Xcode,** from the Mac App Store.
- **Its command-line tools:** in Xcode › Settings… › Locations, choose the
  latest version in the *Command Line Tools* menu.
- **A simulator runtime:** in Xcode › Settings… › Components, under
  *Platform Support*, click *Get* next to iOS.
- **CocoaPods:** Expo's current guide no longer lists it separately. If the
  build stops because CocoaPods or `pod install` is missing, install it:

      brew install cocoapods

Then:

    npx expo prebuild --platform ios
    npx expo run:ios

As with Android, prebuild again after a change to `app.json`, the fonts or a
native module. `run:ios` prebuilds by itself only when `ios/` doesn't exist
yet.

The simulator has no camera. To read a label, add a photo to its library, then
use 휴대폰에 있는 사진 고르기 (Choose a photo from your phone) in the app:

    xcrun simctl addmedia booted label.jpg

Use a synthetic or redacted label only, never a real patient's (see the rules
at the end).

Screenshots work on iOS:

    xcrun simctl io booted screenshot screen.png

### A real iPhone, with a free Apple ID

Without the paid Apple Developer Program, Xcode can still install the app on
your own iPhone, under your Apple ID's "Personal Team".

1. **Developer Mode.** Connect the iPhone to the Mac with a cable, and trust
   the computer. Then, on the phone: Settings › Privacy & Security, the
   *Developer Mode* switch under *Security*. It only appears once the phone
   has been paired with a Mac. The phone restarts; then tap *Enable* and enter
   the passcode.
2. **Signing.** Open `ios/*.xcworkspace` in Xcode. In the app target's
   *Signing & Capabilities* pane, turn on *Automatically manage signing*.
   Choose your Personal Team as the *Team*, after adding your Apple ID under
   Xcode › Settings… › Accounts. (Apple's current docs confirm the first part;
   the Personal Team choice is from experience, not docs.)
3. **Remove the Push Notifications capability** in the same pane.
   `expo-notifications` adds it at every prebuild (the `aps-environment`
   entitlement), and a Personal Team cannot sign an app that has it. The app
   uses only local reminders, which should not need it, but that is untested.
   Redo this after every prebuild.
4. **Run it:** `npx expo run:ios --device`, and choose the phone.
5. **The first launch** may need you to trust your Apple ID as a developer on
   the phone. On recent iOS that is under Settings › General › VPN & Device
   Management (not confirmed in current docs).

If Xcode says the bundle identifier (`com.togurt5.koreanmedassistant`) isn't
available, change it in Xcode for your own builds only. Don't commit that.

**Should work,** untested: the camera and on-device reading (Apple Vision), the
lock (Face ID or passcode), the encrypted list (Keychain), the gallery, label
lookups, and reminders, which are local notifications.

**Doesn't, without the paid account:**

- **It stops opening after 7 days.** Free provisioning profiles expire then, so
  rebuild and reinstall from Xcode every week. Apple also limits a free
  account to 3 apps per device, and its App IDs and devices expire after 7
  days.
- **No TestFlight and no App Store,** and no EAS builds for a phone. Expo's
  internal distribution needs a paid account. The `ios-simulator` profile
  doesn't.
- **No push notifications.** The app doesn't use them.

## Things that look broken and aren't

- **On Android, screenshots of the app come out black,** on the emulator
  too. The app blocks screen capture there on purpose, because Android can't
  hide a medicine list from the app switcher any other way
  (`src/features/security/screen-privacy.ts`). On iOS, screenshots work: the
  app only blurs itself in the app switcher.
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
