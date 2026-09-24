/**
 * The lines of an Android log that say the app failed to start.
 *
 * Kept apart from the script that collects the log so it can be tested
 * without a device — against, among others, the exact line of the crash that
 * prompted it: a build that stripped a permission a native module needs at
 * startup, reported by React Native as
 *
 *     [runtime not ready]: Error: Exception in HostFunction: Permission Denial: …
 */
const CRASH_SIGNS = [
  /FATAL EXCEPTION/,
  /\[runtime not ready\]/,
  /Exception in HostFunction/,
  /Permission Denial/,
  /java\.lang\.SecurityException/,
  /UnsatisfiedLinkError/,
  /Could not find native module|Cannot find native module/,
];

/**
 * Crash lines in `log` that belong to the app: those naming its package or
 * process id, or logged by React Native's own tags, which only the app writes.
 */
export function crashLines(log: string, packageName: string, pid?: string): string[] {
  const ours = (line: string) =>
    line.includes(packageName) ||
    (pid !== undefined && new RegExp(`\\b${pid}\\b`).test(line)) ||
    /ReactNative|ReactNativeJS|unknown:ReactNative|ExpoModulesCore/.test(line);

  const lines = log.split(/\r?\n/);
  const found: string[] = [];
  lines.forEach((line, index) => {
    if (!CRASH_SIGNS.some((sign) => sign.test(line))) return;
    // A fatal exception names its process on the following line.
    const next = lines[index + 1] ?? '';
    if (ours(line) || (/FATAL EXCEPTION/.test(line) && next.includes(packageName))) {
      found.push(line.trim());
    }
  });
  return found;
}
