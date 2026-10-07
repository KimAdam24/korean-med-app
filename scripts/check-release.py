"""Checks a release APK for what a development build has and a release must not.

    python scripts/check-release.py android/app/build/outputs/apk/release/app-release.apk \
        [--mapping android/app/build/outputs/mapping/release/mapping.txt]

Standard library only. Finds aapt2 and dexdump in the Android SDK (ANDROID_HOME,
or the default location on Windows). Exits non-zero if any check fails.

What it checks, and why (docs/release-build.md, docs/dev-only-paths.md):

- The manifest is not debuggable: the sweep replay refuses to run unless it is.
- Every development-only screen, panel and log line is compiled out of the
  JavaScript bundle: its own strings are absent, while shipped copy is present
  (which shows the search works, whichever way Hermes stored the text).
- The app's own native modules are in the dex, and, with R8's mapping, that
  Expo can still find the generated module list it looks up by reflection.
"""
import argparse
import glob
import os
import re
import subprocess
import sys
import zipfile

# Strings only a development-only path contains. Each must be absent.
DEV_ONLY = {
    'raw OCR panel on the result screen': ['Raw OCR:', '읽은 원문'],
    'captured-frame panel': ['Captured frame (dev only)', '찍힌 사진 (개발용)'],
    'file probe on the home screen, and its seed and add buttons': [
        'Read a label from a file (dev only)', 'Seed a sample medicine (dev only)',
        'Add this to my medicines (dev only)', '가짜 약 하나 넣기 (개발용)',
    ],
    'sweep replay button and picker': ['DEV: replay a sweep', 'Development: replay a sweep'],
    'reading log (dev-line-list)': ['[label-ocr] BEGIN', '[label-ocr] END'],
    'replay frame log (replay-log)': ['[sweep-replay] BEGIN', '[sweep-replay] FRAME'],
    # Not the capture preview's switch, EXPO_PUBLIC_DEV_CAPTURE_PREVIEW: a
    # production bundle has every EXPO_PUBLIC_ variable replaced by its value,
    # so the name is absent whether or not the code behind it shipped. The
    # panel's own strings, above, are what show it compiled out.
}
# Shipped copy. Each must be present, or the search above proves nothing.
# These are all in `Strings`, which ships whole, so their presence proves the
# search works, not that the screen showing them does.
SHIPPED = ['Take a photo of your medicine', '약 사진 찍기', 'Fill in what the bottle says',
           'Choose a photo from your phone',
           # Her reviewed Korean (docs/reviews/copy-batch-2026-09-25-reviewed.csv, #41).
           '앱 사용 중에만 허용']
# The app's own native classes, by their original names.
NATIVE = [
    'expo.modules.labelocr.LabelOcrModule',
    'expo.modules.labelsweep.LabelSweepModule',
    'expo.modules.labelsweep.LabelSweepView',
    'expo.modules.dosealarms.DoseAlarmsModule',
    'expo.modules.dosealarms.ScheduleRestorer',
    # Android's Bold text setting (2026-10-06). Missing, the app would draw
    # text at its own weights and say nothing.
    'expo.modules.textweight.TextWeightModule',
]

results = []


def check(ok, what):
    results.append((ok, what))
    print(('PASS  ' if ok else 'FAIL  ') + what)


def tool(name):
    roots = [os.environ.get('ANDROID_HOME'), os.environ.get('ANDROID_SDK_ROOT'),
             os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Android', 'Sdk')]
    for root in filter(None, roots):
        found = sorted(glob.glob(os.path.join(root, 'build-tools', '*', name + '*')))
        if found:
            return found[-1]
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('apk')
    parser.add_argument('--mapping')
    args = parser.parse_args()
    apk = zipfile.ZipFile(args.apk)

    aapt2 = tool('aapt2')
    if aapt2:
        manifest = subprocess.run([aapt2, 'dump', 'xmltree', '--file', 'AndroidManifest.xml', args.apk],
                                  capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
        debuggable = re.search(r'debuggable\(0x0101000f\)=(true|0xffffffff)', manifest)
        check(not debuggable, 'manifest is not debuggable')
        backup = re.search(r'allowBackup\(0x01010280\)=(\w+)', manifest)
        print(f'INFO  android:allowBackup={backup.group(1) if backup else "unset (defaults to true)"}')
    else:
        check(False, 'aapt2 found (set ANDROID_HOME)')

    if 'assets/index.android.bundle' not in apk.namelist():
        # A debug build loads its JavaScript from Metro instead.
        check(False, 'JavaScript bundle embedded (a debug build has none)')
    else:
        bundle = apk.read('assets/index.android.bundle')
        count = lambda text: bundle.count(text.encode('utf-8')) + bundle.count(text.encode('utf-16-le'))
        for what, strings in DEV_ONLY.items():
            present = [text for text in strings if count(text) > 0]
            check(not present, f'compiled out: {what}' + (f' (found {present})' if present else ''))
        for text in SHIPPED:
            check(count(text) > 0, f'shipped copy present, so the search works: {text!r}')

    # The name under its icon, which the reminder tells her to open
    # (strings.ts `reminders.notificationBody`: 약 도우미를 열어서...).
    arsc = apk.read('resources.arsc')
    label = '약 도우미'
    check(arsc.count(label.encode('utf-8')) + arsc.count(label.encode('utf-16-le')) > 0,
          f'app label is {label!r}, the name the reminder tells her to open')

    dex = b''.join(apk.read(name) for name in apk.namelist() if re.match(r'classes\d*\.dex$', name))
    mapping = open(args.mapping, encoding='utf-8').read() if args.mapping else None
    for name in NATIVE:
        if mapping:
            kept = re.search(r'^' + re.escape(name) + r' -> ', mapping, re.M) is not None
        else:
            kept = ('L' + name.replace('.', '/') + ';').encode() in dex
        check(kept, f'native class kept: {name}')

    if mapping:
        renamed = re.search(r'^expo\.modules\.ExpoModulesPackageList -> ([\w.$]+):', mapping, re.M)
        dexdump = tool('dexdump')
        if renamed and dexdump:
            # Expo finds it with Class.forName and then getMethod("getPackageList"):
            # R8 must have turned the first into a reference to the renamed class,
            # and kept the method's name.
            descriptor = 'L' + renamed.group(1).replace('.', '/') + ';'
            listing = ''
            for name in apk.namelist():
                if re.match(r'classes\d*\.dex$', name):
                    path = os.path.join(os.path.dirname(os.path.abspath(args.apk)), '_' + name)
                    open(path, 'wb').write(apk.read(name))
                    listing += subprocess.run([dexdump, '-d', path], capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
                    os.remove(path)
            by_reference = re.search(r'const-class v\d+, ' + re.escape(descriptor) + r'[^\n]*\n[^\n]*\n[^\n]*"getPackageList"', listing)
            check(by_reference is not None, f'Expo finds its module list after R8 (as {renamed.group(1)})')
            method = re.search(r"Class descriptor  : '" + re.escape(descriptor) + r"'.*?(?=Class descriptor|\Z)", listing, re.S)
            check(method is not None and "'getPackageList'" in method.group(0), 'getPackageList kept by name')
        else:
            check(False, 'ExpoModulesPackageList in the mapping, and dexdump found')

    failed = [what for ok, what in results if not ok]
    print(f'\n{len(results) - len(failed)} passed, {len(failed)} failed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
