# Setting up

This is everything needed to build and run the app on a machine
from nothing, including the parts that went wrong the first time, so they
don't go wrong for the next person. It ends with the app running on an Android emulator,
then a release build.

**Windows** is sections 1 to 10. It is how the app has been built so far:
tested, every step but one, which section 2 notes. **A Mac** is [further down](#on-a-mac-untested): written
from current documentation, and untested, since no Mac was available to test
it on.

On Windows, commands are for PowerShell. The versions are the ones on the
machine the app has been built on. Where something must be exactly that
version, it says so.

## Before you start

**Access.** Ask for these before the first day:

- **The GitHub repository.** It is private. Accept the collaborator invitation
  GitHub sends you by email. Until you do, the clone in section 6 fails.
- **A Claude account with Claude Code.** Claude Code needs a paid plan: Pro,
  Max, Team or Enterprise. The free plan doesn't include it. Max is more
  comfortable for this project: its big tasks, like a review of the whole app
  or a design pass, use a lot of a plan's limits.
- **The Expo project,** only for iOS builds in the cloud (section 10). It
  belongs to the `togurt5` account. Make an Expo account of your own, and ask
  the project owner to add you. Nothing else needs it.

**The machine.**

- **Memory: about 16 GB.** Android Studio asks for 16 GB to run with the
  emulator, and recommends 32. The app has been built on a 16 GB laptop:
  enough, except for a release build with the emulator open (section 9).
- **On a Windows PC, virtualization switched on** in the BIOS (Intel VT-x or
  AMD-V). The emulator needs it.
- **Disk: about 60 GB free for Android,** on an SSD. Measured on the machine
  the app is built on: the Android SDK 12 GB, the Pixel 7 emulator 17 GB,
  Android Studio 3 GB, Gradle's cache 6 GB, and the project 18 GB, nearly all
  of it native code compiled into `node_modules` and `android/`. Android's own
  figure, 16 GB for Android Studio and an emulator, leaves the project out.
- **On a Mac, Xcode for iOS on top of that.** The App Store download is
  3.1 GB. It takes far more once installed, and the iOS simulator runtime
  comes on top. Apple publishes no total. Allow another 40 GB or so: an
  estimate, not measured. The current Xcode, 27, needs macOS 26.6 or later
  and an Apple silicon Mac (M1 or later).

## 1. Node 22.23.1, through nvm

The project pins Node **22.23.1** (`.nvmrc`, and `eas.json` for cloud builds).
Use exactly that, so `package-lock.json` is written by the same npm that will
install from it.

1. Install **nvm for Windows**, from its releases page on GitHub,
   github.com/nvm-windows/nvm/releases. Take the latest release not marked
   *Pre-release*, and from its files the setup program for your processor:
   `nvm-<version>-x64-setup.exe`, or `-arm64-` on an ARM PC. It installs for
   your user only, under `%LOCALAPPDATA%\Author Software\nvm`. Its release
   notes say it removes a Node installed from nodejs.org. The machine this
   was built on has version 2.0.1.
2. In a new terminal:

       nvm install 22.23.1
       nvm use 22.23.1

3. Check:

       node -v            # v22.23.1

   If it shows another version, another Node is probably installed some
   other way (the installer from nodejs.org, Chocolatey, the Windows Store).
   `(Get-Command node -All).Source` lists every `node.exe` Windows can find.
   Remove the others.

**"NVM blocked package-manager execution".** This is what Claude Code
installed with npm runs into (section 2's fallback). nvm 2 runs `node`, `npm`, `npx`
and every globally installed command through small stand-in programs
("shims"), and it checks that the script behind each one is the one it
trusted. When that script changes, it refuses to run it:

    NVM blocked package-manager execution because a delegated command could
    not be trusted… Reason: delegated script changed since it was trusted…
    Event code: NVM4306

The fix:

    nvm reshim

(or `nvm doctor --autofix`), then run the command again.

## 2. Claude Code

Install it with its own installer, in PowerShell, not as administrator:

    irm https://claude.ai/install.ps1 | iex

Then, in a new terminal:

    claude --version

If `claude` isn't recognized, its folder (`%USERPROFILE%\.local\bin`) isn't
on your `PATH` yet. "Fix your PATH", in Claude Code's install
troubleshooting, says what to do.

Installed this way, Claude Code doesn't use Node: nvm and its shims don't
touch it, and it updates itself in the background. You log in the first time
you start it, at the end of this file
([Working with Claude Code](#working-with-claude-code)).

This is the one Windows step not tried on the machine the app has been built
on, which has Claude Code from npm (below). The installer is what Claude
Code's docs recommend.

**Fallback: npm.** If the installer doesn't work, install it with npm instead:

    npm install -g @anthropic-ai/claude-code

npm is what brings two costs:

- **The NVM4306 error after every update.** Installed with npm, Claude Code
  has an nvm shim of its own, and each automatic update changes the script
  behind it. Expect to run `nvm reshim` (section 1) after one.
- **A reinstall after switching Node versions.** Globally installed npm
  packages belong to one Node version. After `nvm use` with a different
  version, run the `npm install -g` above again, or `claude` is missing or
  still the old version's.

## 3. Java: Temurin JDK 21, not Android Studio's

Install **Eclipse Temurin JDK 21** from adoptium.net (here:
`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`).

Android Studio brings its own Java (version 25 at the time of writing). The
build fails with it at the CMake step, where the native code is compiled. So
point the build at Temurin 21 instead, with `JAVA_HOME` (next section). If
you ever build from inside Android Studio, set *Settings › Build, Execution,
Deployment › Build Tools › Gradle › Gradle JDK* to the same JDK.

    java -version      # openjdk version "21..."

## 4. Android Studio, the SDK, and two environment variables

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

## 5. An emulator: a Pixel 7 on API 37

In Android Studio's *Device Manager*, create a **Pixel 7** with an **API 37**
system image. That is the device the app has been tested on (`Pixel_7`).

**Start it before building.** The build installs onto a running device and
does not reliably start one itself:

    & "$env:ANDROID_HOME\emulator\emulator.exe" -avd Pixel_7

Wait for its home screen, then check:

    adb devices        # emulator-5554   device

## 6. The project

Install **Git for Windows** from git-scm.com/downloads/win, if
`git --version` doesn't answer. It includes Git Credential Manager, so the
first clone asks you to sign in to GitHub in the browser. Claude Code uses
the Git Bash it brings, too.

Then clone. The repository URL is under the green *Code* button on its
GitHub page:

    git clone <repository URL>
    cd korean-med-app
    npm install

The checks run without a phone or an emulator. They should all pass before
you change anything:

    npm run typecheck
    npm run lint
    npm run test:unit
    npm run test:integration

## 7. Generate the Android project: prebuild, without `--clean`

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

## 8. A development build

With the emulator running:

    npx expo run:android

The first build takes a while (the native code compiles). It installs the app
and starts the development server. After that, JavaScript changes reload
without rebuilding. If you closed the server, start it again with
`npx expo start`. On the emulator, the server is reached at
`http://10.0.2.2:8081`.

Expo Go will not run this app: it has its own native modules, so it needs this
development build.

## 9. A release build

**Close the emulator first.** A release build compiles every CPU architecture
and bundles the JavaScript. With the emulator open as well, the machine runs
out of memory partway through.

    cd android
    .\gradlew.bat app:assembleRelease
    cd ..

**Check the APK before installing it.** `scripts/check-release.py` reads it
and fails if a development-only screen shipped, backups are on, or one of the
app's own native modules is missing (`docs/release-build.md`). It needs
**Python 3**, from python.org; on Windows, its download is now the *Python
install manager*. Then:

    python --version
    python scripts/check-release.py android/app/build/outputs/apk/release/app-release.apk

It should end with `0 failed`.

Then start the emulator again and install:

    adb install -r android/app/build/outputs/apk/release/app-release.apk

`docs/release-build.md` has what to check once it's running.

**"Signatures do not match."** If an install fails with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` and something about signatures, the app
on the emulator was signed with a different key: built on another machine, or
by EAS. Uninstall it, then install again:

    adb uninstall com.togurt5.koreanmedassistant

That deletes the app's data on the emulator: its PIN and saved medicines.

## 10. iOS

There is no iOS build on Windows: building for iOS locally takes a Mac (see
[On a Mac](#on-a-mac-untested)). From Windows, the app is compiled for the iOS
simulator on EAS (Expo's cloud builds), with the profile in `eas.json`:

    npx eas-cli build --platform ios --profile ios-simulator

That needs access to the Expo project, which belongs to the `togurt5`
account ([Before you start](#before-you-start)). The free plan has a monthly
build limit, so don't start one casually.

## On a Mac (untested)

**Untested.** No Mac was available to test it on. On 2026-10-07 every command below was
checked against current documentation: Homebrew's installer, nvm's README,
Expo's setup guides, Android's emulator docs, GitHub's CLI docs and Apple's
developer docs. None of them has been run. Where a step could not be
confirmed in docs, it says so. If something here turns out wrong, fix it here.

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

### Claude Code

As in section 2, with its own installer:

    curl -fsSL https://claude.ai/install.sh | bash

Then, in a new terminal:

    claude --version

It installs to `~/.local/bin`. If `claude` isn't found, that folder isn't on
your `PATH` yet. "Fix your PATH", in Claude Code's install troubleshooting,
says what to do. Installed this way, it doesn't use Node, and it updates
itself.

**Fallback: npm,** as on Windows, where the machine the app has been built on
has it this way:

    npm install -g @anthropic-ai/claude-code

On a Mac, npm brings no NVM4306 error, but the other cost holds: global
packages belong to one Node version. After switching, install Claude Code
again under the new one, or carry every global package over as you install
it:

    nvm install <new version> --reinstall-packages-from=22.23.1

### Java: Temurin JDK 21

    brew install --cask temurin@21

Then, in `~/.zshrc`:

    export JAVA_HOME=$(/usr/libexec/java_home -v 21)

Expo's guide suggests Zulu 17. The project builds with 21 on Windows, so use
21 here too.

**Not Android Studio's Java.** Section 3's warning holds here too: Android
Studio brings its own Java, and the build fails with it at the CMake step.
`JAVA_HOME` keeps the command-line build on Temurin 21. If you ever build
from inside Android Studio, set *Android Studio › Settings… › Build,
Execution, Deployment › Build Tools › Gradle › Gradle JDK* to the same JDK.

### Android Studio, the SDK, and `ANDROID_HOME`

Install Android Studio. In *SDK Manager*, install the same packages as in
section 4. Then, in `~/.zshrc`:

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

Git on a Mac won't open a browser to sign in to GitHub the way Git for
Windows does. So sign in with GitHub's own command-line tool first. When
`gh auth login` asks, choose *HTTPS*, answer *Y* to authenticating Git with
your GitHub credentials, and log in with the browser:

    brew install gh
    gh auth login

Then clone, and switch to the project's Node. The repository URL is under
the green *Code* button on its GitHub page:

    git clone <repository URL>
    cd korean-med-app
    nvm use
    npm install

Then as in sections 6 to 8: the checks, prebuild, and a development build.

    npx expo prebuild --platform android      # without --clean
    npx expo run:android

### A release build

Close the emulator first, as on Windows: the build needs the memory.

    cd android
    ./gradlew app:assembleRelease
    cd ..

Check the APK as in section 9. On a Mac the command is `python3`, not
`python`. If `python3 --version` finds none, `brew install python`.

    python3 scripts/check-release.py android/app/build/outputs/apk/release/app-release.apk

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

## Working with Claude Code

Start it in the repository:

    cd korean-med-app
    claude

The first time, it opens the browser to log in with your Claude account.

**First, a check.** Ask it to read `CLAUDE.md` and `SETUP.md` and summarize
the project. The summary should get the rules right: the three above, and
the rest of `CLAUDE.md`'s, such as refusing rather than guessing and never
fuzzy-matching a drug name. If it gets something wrong, find out why before
giving it real work.

- **`CLAUDE.md` holds the rules,** and Claude Code reads it by itself at the
  start of every session: there's no need to paste it in. It also pulls in
  `AGENTS.md`, which sends Claude Code to the Expo SDK 57 docs before it
  writes code.
- **Proposed first:** anything that touches label lookups, safety text or
  refusals. Claude Code reports the plan and waits for a decision before
  building it (`CLAUDE.md`, "Propose first").
- **Check `/usage` before a big task.** It shows how much of your plan's
  limits is used. A review of the whole app or a design pass takes a lot,
  and is better started with room to finish than stopped halfway.
