/**
 * Launches the installed Android build and fails unless it draws its first
 * screen and stays up.
 *
 *     npm run smoke:android -- --dev-server http://10.0.2.2:8081   # a dev build on the emulator
 *     npm run smoke:android                                         # a preview or release build
 *
 * Why this exists: the Jest suites fake every native module, so a failure that
 * only Android can produce — a permission stripped from the manifest that a
 * native module needs as it loads — passes them all and crashes the real app
 * at launch. That happened. This is the only check in the repository that runs
 * the native code.
 *
 * What counts as a pass: one of the app's own first-screen texts appears in the
 * UI hierarchy (see `smoke/first-screen`), and nothing crashes for a few
 * seconds after. A live process is not enough — a dev build whose server is
 * unreachable sits on a blank screen, alive and crash-free, and an earlier
 * version of this script reported that as a pass. For the same reason a dev
 * server is checked before launch: on the emulator the host is 10.0.2.2.
 *
 * It only launches the app and reads from the device: it never clears data,
 * reinstalls, or clears the log — it reads what was logged after launch — and
 * the UI dump goes to standard output rather than a file. Safe to run against
 * a phone or emulator in use. Needs `adb` and one connected device.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { crashLines } from './smoke/crash-lines.ts';
import { firstScreenIn } from './smoke/first-screen.ts';

const root = path.resolve(import.meta.dirname, '..');
const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const packageName: string = app.android.package;

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const devServer = option('--dev-server');
const seconds = Number(option('--seconds') ?? 60);
const settle = Number(option('--settle') ?? 8);

function findAdb(): string {
  const sdk =
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined);
  const candidate = sdk
    ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    : undefined;
  return candidate && existsSync(candidate) ? candidate : 'adb';
}

const adbPath = findAdb();
const adb = (...command: string[]) =>
  execFileSync(adbPath, command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

function fail(message: string, lines: string[] = []): never {
  console.error(`\nSMOKE FAILED: ${message}`);
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  if (adb('get-state') !== 'device') fail('no device connected');
} catch {
  fail('no device connected (is an emulator running?)');
}
if (!adb('shell', 'pm', 'list', 'packages', packageName).includes(packageName)) {
  fail(`${packageName} is not installed`);
}

if (devServer) {
  // Checked from this machine; the emulator's 10.0.2.2 is this machine's localhost.
  const fromHere = devServer.replace('10.0.2.2', '127.0.0.1');
  let status = '';
  try {
    const response = await fetch(`${fromHere}/status`, { signal: AbortSignal.timeout(8000) });
    status = await response.text();
  } catch {
    status = '';
  }
  if (!status.includes('packager-status:running')) {
    fail(`the dev server is not answering at ${fromHere} — start or restart it (npx expo start)`);
  }
}

// The device's own clock, as seconds since the epoch: only what is logged from
// here on is read, and nothing earlier is touched.
const since = `${adb('shell', 'date', '+%s')}.000`;
if (devServer) {
  // expo-dev-client's own scheme, which opens the app on a given bundle.
  const url = `exp+${app.slug}://expo-development-client/?url=${encodeURIComponent(devServer)}`;
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`);
} else {
  adb('shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1');
}
console.log(
  `Launched ${packageName}${devServer ? ` on ${devServer}` : ''}; waiting up to ${seconds}s for its first screen…`
);

let pid: string | undefined;
let shownAt: number | null = null;
let shown: string | null = null;

for (let second = 0; second < seconds; second += 1) {
  await sleep(1000);

  let alive = '';
  try {
    alive = adb('shell', 'pidof', packageName);
  } catch {
    alive = '';
  }
  if (alive) pid = alive.split(/\s+/)[0];

  const crashes = crashLines(adb('logcat', '-d', '-T', since), packageName, pid);
  if (crashes.length > 0) fail('the app crashed while starting', crashes);
  if (pid && !alive) fail('the app process exited while starting');

  if (shownAt === null) {
    try {
      shown = firstScreenIn(adb('exec-out', 'uiautomator', 'dump', '/dev/tty'));
    } catch {
      shown = null;
    }
    if (shown) shownAt = second;
  } else if (second - shownAt >= settle) {
    console.log(
      `SMOKE OK: ${packageName} showed its first screen ("${shown}") after ${shownAt + 1}s ` +
        `and stayed up ${settle}s more (pid ${pid}).`
    );
    process.exit(0);
  }
}

if (!pid) fail('the app never started');
fail(
  shownAt === null
    ? `the app never showed its first screen within ${seconds}s${devServer ? ' — did the bundle load?' : ''}`
    : `the app did not stay up for ${settle}s after its first screen`
);
