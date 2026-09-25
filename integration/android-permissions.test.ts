/**
 * The Android permissions the app removes, checked against the native code
 * that ships with it.
 *
 * The rest of the integration suite replaces native modules with JavaScript
 * fakes, so it cannot see this class of failure at all: a permission stripped
 * from the manifest is only noticed by Android, at runtime, on a device. That
 * is how a build crashed at launch — `DETECT_SCREEN_CAPTURE` was blocked on
 * the belief that only expo-screen-capture's screenshot listener used it, while
 * the module registers a screen-capture callback in its own `OnCreate` on
 * Android 14+, whatever the app does, and Android throws without it.
 *
 * So these tests read the permissions the build will actually remove — from
 * Expo's config introspection, plugins included — and the Kotlin and Java of
 * every native library installed, and hold two rules:
 *
 *   1. A library that calls an Android API needing a permission keeps it.
 *   2. Where a library names a permission the app removes, it only asks about
 *      it — a permission check or request — and never assumes it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

/**
 * Android APIs that throw `SecurityException` unless the app holds a
 * permission, as the Android API reference states for each ("Requires …").
 * Not exhaustive: extend it when a library is added that calls another.
 */
const APIS_REQUIRING_PERMISSION = [
  {
    api: /\bregisterScreenCaptureCallback\s*\(/,
    permission: 'android.permission.DETECT_SCREEN_CAPTURE',
  },
  { api: /\bsetAudioSource\s*\(|\bnew AudioRecord\s*\(|\bAudioRecord\s*\(/, permission: 'android.permission.RECORD_AUDIO' },
  { api: /\bsetCameraPermissionState\b|\bCameraManager\.openCamera\s*\(/, permission: 'android.permission.CAMERA' },
  // expo-notifications arms dose reminders with exact alarms when it may.
  // Blocked, reminders would silently degrade to inexact ones, late in Doze
  // (see modules/dose-alarms).
  { api: /\bsetExactAndAllowWhileIdle\s*\(/, permission: 'android.permission.SCHEDULE_EXACT_ALARM' },
];

/**
 * Every permission the app removes, and why that is safe. A new removal fails
 * the suite until it is written down here — the step that was skipped when
 * `DETECT_SCREEN_CAPTURE` was blocked.
 */
const REVIEWED_REMOVALS: Record<string, string> = {
  'android.permission.READ_EXTERNAL_STORAGE':
    'Photos come from the system photo picker, which needs no permission. expo-screen-capture ' +
    'only checks it before reading screenshots on Android 12 and below, and logs if absent.',
  'android.permission.WRITE_EXTERNAL_STORAGE':
    'Nothing is written outside the app’s own directories.',
  'android.permission.SYSTEM_ALERT_WINDOW':
    'Template leftover; nothing draws over other apps.',
  'android.permission.READ_MEDIA_IMAGES':
    'expo-screen-capture only checks it before reading screenshots on Android 13, and logs if ' +
    'absent. The app does not listen for screenshots.',
  'android.permission.RECORD_AUDIO':
    'The camera takes stills only (recordAudioAndroid: false); nothing records sound.',
};

/**
 * Library calls rule 1 would flag that the app never reaches, with the reason.
 * Keyed `package → permission`.
 */
const UNREACHED: Record<string, Record<string, string>> = {
  'expo-camera': {
    'android.permission.RECORD_AUDIO':
      'Audio is recorded only by video recording, which the app never starts (mode="picture").',
  },
};

type Source = { pkg: string; file: string; text: string };

function removedPermissions(): string[] {
  // `npx` is a script on Windows; run the CLI through Node directly instead.
  const cli = require.resolve('expo/bin/cli', { paths: [root] });
  const json = execFileSync(process.execPath, [cli, 'config', '--type', 'introspect', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const manifest = JSON.parse(json)._internal.modResults.android.manifest.manifest;
  return (manifest['uses-permission'] ?? [])
    .filter((entry: { $: Record<string, string> }) => entry.$['tools:node'] === 'remove')
    .map((entry: { $: Record<string, string> }) => entry.$['android:name']);
}

/** Kotlin and Java under each installed package's `android/`, and the local modules. */
function nativeSources(): Source[] {
  const packages: { pkg: string; dir: string }[] = [];
  const modules = path.join(root, 'node_modules');
  for (const entry of readdirSync(modules)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      for (const scoped of readdirSync(path.join(modules, entry))) {
        packages.push({ pkg: `${entry}/${scoped}`, dir: path.join(modules, entry, scoped) });
      }
    } else {
      packages.push({ pkg: entry, dir: path.join(modules, entry) });
    }
  }
  for (const local of readdirSync(path.join(root, 'modules'))) {
    packages.push({ pkg: local, dir: path.join(root, 'modules', local) });
  }

  const sources: Source[] = [];
  const walk = (pkg: string, dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (entry === 'build' || entry === 'test' || entry === 'androidTest') continue;
      if (statSync(full).isDirectory()) walk(pkg, full);
      else if (/\.(kt|java)$/.test(entry)) sources.push({ pkg, file: full, text: readFileSync(full, 'utf8') });
    }
  };
  for (const { pkg, dir } of packages) {
    const android = path.join(dir, 'android', 'src', 'main');
    if (existsSync(android)) walk(pkg, android);
  }
  return sources;
}

const removed = removedPermissions();
const sources = nativeSources();
const short = (permission: string) => permission.replace('android.permission.', '');

test('the scan sees the native code that ships', () => {
  // Guards the guard: if the walk found nothing, every rule below would pass.
  const scanned = new Set(sources.map((source) => source.pkg));
  for (const pkg of ['expo-screen-capture', 'expo-camera', 'expo-local-authentication', 'label-ocr']) {
    expect(scanned).toContain(pkg);
  }
});

test('every removed permission has been reviewed', () => {
  for (const permission of removed) {
    expect({ permission, reviewed: permission in REVIEWED_REMOVALS }).toEqual({ permission, reviewed: true });
  }
});

test('a library that calls an API needing a permission keeps that permission', () => {
  const violations: string[] = [];
  for (const { api, permission } of APIS_REQUIRING_PERMISSION) {
    if (!removed.includes(permission)) continue;
    for (const source of sources) {
      if (!api.test(source.text)) continue;
      if (UNREACHED[source.pkg]?.[permission]) continue;
      violations.push(`${source.pkg} (${path.basename(source.file)}) needs ${short(permission)}, which is removed`);
    }
  }
  expect(violations).toEqual([]);
});

test('where a library names a removed permission, it only asks about it', () => {
  // Asking: a permission check, a request, a status read, or a check that
  // rejects the call when the permission is missing. Judged on the mention and
  // the few lines around it, since these calls are often split across lines.
  const asking =
    /checkSelfPermission|checkPermission|hasGrantedPermissions|PermissionsWithPermissionsManager|askForPermissions|getPermissions|requestPermissions|shouldShowRequestPermissionRationale|MissingPermissions|PermissionsStatus\.GRANTED|isGranted/;
  const violations: string[] = [];
  for (const permission of removed) {
    const name = short(permission);
    const mention = new RegExp(`(permission\\.|["'])${name}\\b|android\\.permission\\.${name}\\b`);
    for (const source of sources) {
      const lines = source.text.split('\n');
      lines.forEach((line, index) => {
        if (!mention.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
        const context = lines.slice(Math.max(0, index - 6), index + 3).join('\n');
        if (asking.test(context)) return;
        // Or it sits inside a function that exists to handle permissions —
        // building the list a request is made with, say.
        const enclosing = lines
          .slice(0, index + 1)
          .reverse()
          .map((candidate) => /\bfun\s+(\w+)|\b(?:public|private|protected|static)\s[^=;]*?\s(\w+)\s*\(/.exec(candidate))
          .find(Boolean);
        if (enclosing && /permission/i.test(enclosing[1] ?? enclosing[2] ?? '')) return;
        violations.push(`${source.pkg} ${path.basename(source.file)}:${index + 1}: ${line.trim()}`);
      });
    }
  }
  expect(violations).toEqual([]);
});
