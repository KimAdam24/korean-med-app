import { redactForLog } from '../log-redaction.ts';
import type { RecognizedTextLine } from '../types.ts';

/**
 * DEVELOPMENT REPLAY ONLY: every frame a replayed sweep read, logged once,
 * when it ends, so a merge problem found on an emulator can become a test.
 *
 * Not a setting. Frames are kept only while the sweep is a replay, and only
 * those the native view says it read from a replay file, so no configuration
 * keeps a frame from a camera: a real sweep still logs its merged reading
 * once, and nothing else (see `SweepReader`).
 *
 * Redacted as every development log is (`log-redaction`): anything not
 * evidently label text is written in shape only. One entry per frame, all of
 * them at the end, between BEGIN and END: logcat cuts an entry at about 4 KB,
 * which a single entry for the whole sweep would not survive.
 */
export function logReplayFrames(name: string, frames: readonly (readonly RecognizedTextLine[])[]): void {
  // Read off the global rather than as the bare `__DEV__`, so this module also
  // loads under Node, where its test runs; the caller checks `__DEV__` too.
  if ((globalThis as { __DEV__?: boolean }).__DEV__ !== true) return;
  console.log(`[sweep-replay] BEGIN ${name} ${frames.length} frame(s)`);
  frames.forEach((lines, index) => {
    console.log(`[sweep-replay] FRAME ${index + 1}/${frames.length} ${JSON.stringify(redactForLog(lines).map(compact))}`);
  });
  console.log(`[sweep-replay] END ${name}`);
}

/** A line in few characters: text, confidence, frame, corners, rounded as the geometry needs. */
export type CompactLine = {
  readonly t: string;
  readonly c: number | null;
  readonly f?: readonly [number, number, number, number];
  readonly k?: readonly number[];
};

export function compact(line: RecognizedTextLine): CompactLine {
  const round = (value: number) => Math.round(value);
  return {
    t: line.text,
    c: line.confidence === null ? null : Math.round(line.confidence * 1000) / 1000,
    ...(line.frame
      ? { f: [round(line.frame.left), round(line.frame.top), round(line.frame.width), round(line.frame.height)] as const }
      : {}),
    ...(line.corners ? { k: line.corners.flatMap((point) => [round(point.x), round(point.y)]) } : {}),
  };
}

/** The inverse of `compact`, for reading a logged replay back into a test. */
export function expand(line: CompactLine): RecognizedTextLine {
  const corners = line.k
    ? Array.from({ length: line.k.length / 2 }, (_, index) => ({ x: line.k![index * 2], y: line.k![index * 2 + 1] }))
    : undefined;
  return {
    text: line.t,
    confidence: line.c,
    ...(line.f ? { frame: { left: line.f[0], top: line.f[1], width: line.f[2], height: line.f[3] } } : {}),
    ...(corners ? { corners } : {}),
  };
}
