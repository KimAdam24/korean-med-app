/**
 * Launches the installed Android build and fails if it does not stay up.
 *
 *     npm run smoke:android                               # a preview or release build
 *     npm run smoke:android -- --dev-server http://10.0.2.2:8081   # a dev build
 *
 * Why this exists: the Jest suites fake every native module, so a failure that
 * only Android can produce — a permission stripped from the manifest that a
 * native module needs as it loads — passes them all and crashes the real app
 * at launch. That happened. This is the check that would have seen it, and it
 * is the only one in the repository that runs the native code at all.
 *
 * It only launches the app; it never clears data or reinstalls anything, so it
 * is safe to run against a phone or emulator in use. Needs `adb` (Android SDK
 * platform-tools) and one connected device.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { crashLines } from './smoke/crash-lines.ts';

const root = path.resolve(import.meta.dirname, '..');
const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const packageName: string = app.android.package;

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const devServer = option('--dev-server');
const seconds = Number(option('--seconds') ?? 25);

function findAdb(): string {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ??
    (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined);
  const candidate = sdk ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : undefined;
  return candidate && existsSync(candidate) ? candidate : 'adb';
}

const adbPath = findAdb();
const adb = (...command: string[]) =>
  execFileSync(adbPath, command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fail(message: string, lines: string[] = []): never {
  console.error(`\nSMOKE FAILED: ${message}`);
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

try {
  if (adb('get-state') !== 'device') fail('no device connected');
} catch {
  fail('no device connected (is an emulator running?)');
}
if (!adb('shell', 'pm', 'list', 'packages', packageName).includes(packageName)) {
  fail(`${packageName} is not installed`);
}

adb('logcat', '-c');
if (devServer) {
  // expo-dev-client's own scheme, which opens the app on a given bundle.
  const url = `exp+${app.slug}://expo-development-client/?url=${encodeURIComponent(devServer)}`;
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`);
} else {
  adb('shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1');
}
console.log(`Launched ${packageName}${devServer ? ` on ${devServer}` : ''}; watching for ${seconds}s…`);

let pid: string | undefined;
for (let second = 0; second < seconds; second += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  let alive = '';
  try {
    alive = adb('shell', 'pidof', packageName);
  } catch {
    alive = '';
  }
  if (alive) pid = alive.split(/\s+/)[0];

  const crashes = crashLines(adb('logcat', '-d'), packageName, pid);
  if (crashes.length > 0) fail('the app crashed while starting', crashes);
  if (pid && !alive) fail('the app process exited while starting');
}

if (!pid) fail('the app never started');
console.log(`SMOKE OK: ${packageName} started and stayed up for ${seconds}s (pid ${pid}).`);
