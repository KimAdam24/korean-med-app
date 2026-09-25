/**
 * Getting the rest of a label that curved out of the photograph: reading it
 * while the bottle turns (the sweep), and filling in by hand what is still
 * missing. End to end through the real capture screen; only the camera views
 * are fakes.
 *
 * No real sweep has been recorded yet, so the frames here are hand-built to
 * the shape of the vitamin D2 vial turning in a hand, as in `merge.test.ts`.
 */
import { fireEvent, screen } from 'expo-router/testing-library';

import {
  APP_LOAD_BUDGET_MS,
  forgetAppStateListeners,
  launchApp,
  loadApp,
  press,
  sendAppTo,
} from './app-harness';
import { camera } from './fakes/camera';
import { ocr } from './fakes/devices';
import { disk } from './fakes/file-system';
import { sweep } from './fakes/label-sweep';

import { VITAMIN_D2_VIAL_LINES, VITAMIN_D2_VIAL_RETAKE_LINES } from '@/features/ocr/eval/corpus';
import type { RecognizedTextLine } from '@/features/ocr/types';
import { loadProfile } from '@/features/medications/medication-store';
import { Strings, fillTemplate } from '@/i18n/strings';

beforeAll(loadApp, APP_LOAD_BUDGET_MS);
beforeEach(forgetAppStateListeners);

const runtime = globalThis as unknown as { __DEV__: boolean };
let wasDev: boolean;
beforeEach(() => {
  wasDev = runtime.__DEV__;
  runtime.__DEV__ = false;
});
afterEach(() => {
  runtime.__DEV__ = wasDev;
});

/** A made-up vial, as printed. */
const PRINTED = [
  'JANE DOE',
  '12 OAK ST, SPRINGFIELD, MA 01101',
  'VITAMIN D2',
  '1.25MG(50,',
  '000 UNIT)',
  'Generic for: Calciferol, Drisdol',
  'Take 1 capsule (50,000',
  'units) by mouth every 7',
  'days',
];
const TRUTH = 'Take 1 capsule (50,000 units) by mouth every 7 days';

/**
 * One frame: the printed lines with some read differently, laid out level.
 * The long lines all end at `width`, where the label turns out of sight: a
 * line that runs on past it is cut there, which is what the edge check finds.
 */
function frame(overrides: Record<number, string | null> = {}, width = 600): RecognizedTextLine[] {
  return PRINTED.flatMap((printed, index) => {
    const text = index in overrides ? overrides[index] : printed;
    if (text === null) return [];
    const right = Math.min(width, 100 + text.length * 26);
    return [
      {
        text,
        confidence: 0.8,
        frame: { left: 100, top: index * 60, width: right - 100, height: 40 },
        corners: [
          { x: 100, y: index * 60 },
          { x: right, y: index * 60 },
          { x: right, y: index * 60 + 40 },
          { x: 100, y: index * 60 + 40 },
        ],
      },
    ];
  });
}

/** Facing the camera: the ends of the two long direction lines are round the curve. */
const FACING = frame({ 6: 'Take 1 capsule (50,0', 7: 'units) by mouth every' });
/** Turned a little: the first direction line fits, the second is still cut. */
const TURNED = frame({ 7: 'units) by mouth every' });
/** Turned further: the second fits, the first has lost its start. */
const FURTHER = frame({ 0: 'NE DOE', 6: 'ke 1 capsule (50,000' });

const PICKED = 'file:///cache/ImagePicker/label.jpg';

async function openPickedPhoto(lines: readonly RecognizedTextLine[]) {
  disk.write(PICKED, 'picked-jpeg-bytes');
  ocr.willRead(lines as Parameters<typeof ocr.willRead>[0]);
  launchApp(`/camera?imageUri=${encodeURIComponent(PICKED)}`);
}

async function startSweep() {
  await openPickedPhoto(FACING);
  await screen.findByText(Strings.result.curved.title.ko);
  press(Strings.sweep.start.ko);
  await screen.findByText(Strings.sweep.privacy.ko);
}

const savedDirections = async () => {
  const profile = await loadProfile();
  return profile.status === 'ok' ? profile.value.medications[0]?.instructions : 'unreadable';
};

describe('reading a curved label while it turns', () => {
  it('reads each cut line whole from a later frame, and the directions are shown and saved', async () => {
    await startSweep();
    expect(sweep.reading).toBe(true);
    // The photograph's camera is not running alongside it.
    expect(screen.queryByTestId('camera-preview')).toBeNull();

    await sweep.frame(FACING);
    expect(screen.getByText(fillTemplate(Strings.sweep.progress, { n: 2 }).ko)).toBeTruthy();
    await sweep.frame(TURNED);
    expect(screen.getByText(fillTemplate(Strings.sweep.progress, { n: 1 }).ko)).toBeTruthy();
    await sweep.frame(FURTHER);

    // Every line read whole: it stops by itself and shows the reading.
    await screen.findByText(TRUTH);
    expect(sweep.mounted).toBe(false);
    expect(screen.queryByText(Strings.result.curved.title.ko)).toBeNull();
    // No photograph was taken, so none is said to have been deleted, or read.
    expect(screen.getByText(Strings.sweep.nothingTaken.ko)).toBeTruthy();
    expect(screen.getByText(Strings.sweep.compareWithBottle.ko)).toBeTruthy();
    expect(screen.queryByText(Strings.result.compareWithBottle.ko)).toBeNull();
    expect(screen.queryByText(Strings.camera.discarded.ko)).toBeNull();
    expect(camera.state.shots).toBe(0);

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    expect(await savedDirections()).toBe(TRUTH);
  });

  it('never lets a frame of something else count as the label', async () => {
    await startSweep();
    // A hand, a table: a line or two of nothing is not a reading.
    await sweep.frame([{ text: 'IKEA', confidence: 0.9 }]);
    expect(screen.getByText(Strings.sweep.waiting.ko)).toBeTruthy();
    expect(screen.queryByRole('button', { name: Strings.sweep.stop.ko })).toBeNull();
  });

  it('stopped early, shows what it has, still withholding what is cut, with the fallback offered', async () => {
    await startSweep();
    await sweep.frame(FACING);
    press(Strings.sweep.stop.ko);

    await screen.findByText(Strings.result.curved.title.ko);
    expect(screen.getByText(Strings.result.curved.fieldNote.ko)).toBeTruthy();
    expect(screen.queryByText(/every days|\(50,0 /)).toBeNull();
    expect(screen.getByRole('button', { name: Strings.fillIn.start.ko })).toBeTruthy();
    // And it can be tried again.
    expect(screen.getByRole('button', { name: Strings.sweep.start.ko })).toBeTruthy();
  });

  it('ends by itself when nothing new has been read for a while, and says why', async () => {
    await startSweep();
    await sweep.frame(FACING);
    await jest.advanceTimersByTimeAsync(15_000);
    // Still turning: a few slow seconds are not a stall.
    expect(sweep.reading).toBe(true);
    await sweep.frame(TURNED);
    await jest.advanceTimersByTimeAsync(15_000);
    // Progress restarted the clock.
    expect(sweep.reading).toBe(true);
    await jest.advanceTimersByTimeAsync(6_000);

    // The camera is not left running; what was read is shown, cut line withheld.
    await screen.findByText(Strings.sweep.stalled.ko);
    expect(sweep.mounted).toBe(false);
    expect(screen.getByText(Strings.sweep.nothingTaken.ko)).toBeTruthy();
    expect(screen.queryByText(TRUTH)).toBeNull();
    expect(screen.getByRole('button', { name: Strings.fillIn.start.ko })).toBeTruthy();
  });

  it('cancelled, goes back to the photograph’s reading as it was', async () => {
    await startSweep();
    await sweep.frame(TURNED);
    press(Strings.medications.cancel.ko);

    await screen.findByText(Strings.result.curved.title.ko);
    expect(sweep.mounted).toBe(false);
    expect(screen.getByText(Strings.camera.discarded.ko)).toBeTruthy();
  });

  it('leaving the app ends it, and what was read goes with it', async () => {
    await startSweep();
    await sweep.frame(FACING);
    await sendAppTo('background');
    await screen.findByText(Strings.lock.title.ko);
    expect(sweep.mounted).toBe(false);
  });

  it('says so when the camera cannot start', async () => {
    await startSweep();
    await sweep.fail();
    expect(screen.getByText(Strings.sweep.failed.ko)).toBeTruthy();
    expect(screen.getByRole('button', { name: Strings.medications.cancel.ko })).toBeTruthy();
  });

  it('in a development build, logs one reading per sweep, not one per frame, and not the name', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await startSweep();
      runtime.__DEV__ = true;
      log.mockClear();
      await sweep.frame(FACING);
      await sweep.frame(TURNED);
      await sweep.frame(FURTHER);
      await screen.findByText(TRUTH);

      const readings = log.mock.calls.filter(([text]) => String(text).includes('[label-ocr] BEGIN'));
      expect(readings).toHaveLength(1);
      expect(String(readings[0][0])).toContain('BEGIN sweep');
      expect(String(readings[0][0])).not.toContain('JANE');
      expect(String(readings[0][0])).not.toContain('OAK');
    } finally {
      log.mockRestore();
    }
  });

  it('is not offered where the phone cannot do it (iOS, until its Swift is built)', async () => {
    sweep.available = false;
    await openPickedPhoto(FACING);
    await screen.findByText(Strings.result.curved.title.ko);
    expect(screen.queryByRole('button', { name: Strings.sweep.start.ko })).toBeNull();
    // Filling in is the way to the rest there.
    expect(screen.getByRole('button', { name: Strings.fillIn.start.ko })).toBeTruthy();
  });

  it('is not offered for a label cut at the edge but not judged curved', async () => {
    // One cut line only: withheld, but no curve diagnosed.
    await openPickedPhoto(frame({ 7: 'units) by mouth every' }));
    await screen.findByText('VITAMIN D2');
    // Withheld, and said to be cut at the edge, not round a curve.
    expect(screen.getByText(Strings.result.curved.edgeNote.ko)).toBeTruthy();
    expect(screen.queryByText(Strings.result.curved.title.ko)).toBeNull();
    expect(screen.queryByRole('button', { name: Strings.sweep.start.ko })).toBeNull();
  });
});

describe('the development replay', () => {
  const replayLog = (log: jest.SpyInstance) =>
    log.mock.calls.map(([text]) => String(text)).filter((text) => text.startsWith('[sweep-replay]'));

  async function replay(name: string) {
    launchApp('/camera');
    fireEvent.press(await screen.findByRole('button', { name: 'DEV: replay a sweep' }));
    fireEvent.press(await screen.findByRole('button', { name }));
    await screen.findByText(Strings.sweep.privacy.ko);
  }

  it('is chosen on the capture screen, and merged as the camera would be', async () => {
    runtime.__DEV__ = true;
    sweep.replays = ['synthetic-images', 'vial-turning.mp4'];
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await replay('vial-turning.mp4');
      expect(sweep.replay).toBe('vial-turning.mp4');
      await sweep.frame(FACING);
      await sweep.frame(TURNED);
      await sweep.frame(FURTHER);
      await screen.findByText(TRUTH);
      expect(sweep.mounted).toBe(false);

      // Every frame, once, at the end, redacted: the test material for the merge.
      const lines = replayLog(log);
      expect(lines[0]).toBe('[sweep-replay] BEGIN vial-turning.mp4 3 frame(s)');
      expect(lines.filter((line) => line.startsWith('[sweep-replay] FRAME'))).toHaveLength(3);
      expect(lines.at(-1)).toBe('[sweep-replay] END vial-turning.mp4');
      expect(lines.join('\n')).not.toMatch(/JANE|OAK|SPRINGFIELD/);
      expect(lines.join('\n')).toContain('Take 1 capsule (50,0');
    } finally {
      log.mockRestore();
    }
  });

  it('keeps no frame the native view did not mark as a replay’s', async () => {
    runtime.__DEV__ = true;
    sweep.replays = ['synthetic-images'];
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await replay('synthetic-images');
      await sweep.frame(FACING, 'camera');
      press(Strings.sweep.stop.ko);
      await screen.findByText(Strings.result.curved.title.ko);
      expect(replayLog(log).filter((line) => line.startsWith('[sweep-replay] FRAME'))).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });

  it('a sweep from the camera keeps no frames, even in a development build', async () => {
    runtime.__DEV__ = true;
    sweep.replays = ['synthetic-images'];
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await startSweep();
      await sweep.frame(FACING);
      await sweep.frame(TURNED);
      await sweep.frame(FURTHER);
      await screen.findByText(TRUTH);
      expect(replayLog(log)).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });

  it('is not offered in a release build', async () => {
    sweep.replays = ['synthetic-images'];
    launchApp('/camera');
    await screen.findByRole('button', { name: Strings.camera.shutter.ko });
    expect(screen.queryByRole('button', { name: 'DEV: replay a sweep' })).toBeNull();
  });
});

const box = (line: number, read: string) =>
  screen.getByLabelText(fillTemplate(Strings.fillIn.wordLabel, { line, read }).ko);

describe('filling in what could not be read', () => {
  it('the vial: types the two broken words from the bottle, confirms, and the directions are saved', async () => {
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(Strings.result.damaged.instructions.title.ko);
    press(Strings.fillIn.start.ko);
    await screen.findByText(Strings.fillIn.title.ko);

    // Only the broken words are boxes, prefilled with what was read.
    const number = screen.getByDisplayValue('(b');
    const interval = screen.getByDisplayValue('eve');
    fireEvent.changeText(number, '(50,000');
    fireEvent.changeText(interval, 'every 7');
    press(Strings.fillIn.check.ko);

    // Shown back, whole, before it replaces anything.
    await screen.findByText(Strings.fillIn.confirmTitle.ko);
    expect(screen.getByText(TRUTH)).toBeTruthy();
    press(Strings.fillIn.confirmYes.ko);

    await screen.findByText(Strings.fillIn.filledNote.ko);
    expect(screen.getByText(TRUTH)).toBeTruthy();
    expect(screen.queryByText(Strings.result.damaged.instructions.title.ko)).toBeNull();
    expect(screen.queryByText(Strings.result.notSavedInstructions.ko)).toBeNull();

    press(Strings.medications.saveFromLabel.ko);
    await screen.findByText(Strings.scan.saved.ko);
    expect(await savedDirections()).toBe(TRUTH);
  });

  it('refuses an answer that still does not read whole, and keeps what was typed', async () => {
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(Strings.result.damaged.instructions.title.ko);
    press(Strings.fillIn.start.ko);
    await screen.findByText(Strings.fillIn.title.ko);

    // The number fixed, the interval left as "eve".
    fireEvent.changeText(screen.getByDisplayValue('(b'), '(50,000');
    press(Strings.fillIn.check.ko);

    expect(screen.getByText(Strings.fillIn.stillIncomplete.ko)).toBeTruthy();
    expect(screen.queryByText(Strings.fillIn.confirmTitle.ko)).toBeNull();
    expect(screen.getByDisplayValue('(50,000')).toBeTruthy();
  });

  it('"change it" goes back to the boxes, and cancel back to the reading, unchanged', async () => {
    await openPickedPhoto(VITAMIN_D2_VIAL_LINES);
    await screen.findByText(Strings.result.damaged.instructions.title.ko);
    press(Strings.fillIn.start.ko);
    await screen.findByText(Strings.fillIn.title.ko);
    fireEvent.changeText(screen.getByDisplayValue('(b'), '(50,000');
    fireEvent.changeText(screen.getByDisplayValue('eve'), 'every 7');
    press(Strings.fillIn.check.ko);
    await screen.findByText(Strings.fillIn.confirmTitle.ko);

    press(Strings.fillIn.confirmNo.ko);
    expect(screen.getByDisplayValue('every 7')).toBeTruthy();

    press(Strings.medications.cancel.ko);
    await screen.findByText(Strings.result.damaged.instructions.title.ko);
    expect(screen.queryByText(TRUTH)).toBeNull();
  });

  it('after a sweep stopped short: fills in the two cut ends', async () => {
    await startSweep();
    await sweep.frame(FACING);
    press(Strings.sweep.stop.ko);
    await screen.findByText(Strings.result.curved.title.ko);
    press(Strings.fillIn.start.ko);
    await screen.findByText(Strings.fillIn.title.ko);

    // The cut ends of lines 7 and 8, each prefilled with its fragment.
    fireEvent.changeText(box(7, '(50,0'), '(50,000');
    fireEvent.changeText(box(8, 'every'), 'every 7');
    press(Strings.fillIn.check.ko);
    await screen.findByText(Strings.fillIn.confirmTitle.ko);
    press(Strings.fillIn.confirmYes.ko);

    await screen.findByText(Strings.fillIn.filledNote.ko);
    expect(screen.getByText(TRUTH)).toBeTruthy();
    // Still a sweep's reading: no photograph to have deleted.
    expect(screen.getByText(Strings.sweep.nothingTaken.ko)).toBeTruthy();
  });

  it('is not offered for a field the reading never found (the retake’s directions)', async () => {
    // The retake's direction lines start with a "|" the edge of the label
    // read as, so the parser never made them a field; filling in words
    // cannot change that, and the button would lead only to "incomplete".
    await openPickedPhoto(VITAMIN_D2_VIAL_RETAKE_LINES);
    await screen.findByText(Strings.result.curved.title.ko);
    expect(screen.queryByRole('button', { name: Strings.fillIn.start.ko })).toBeNull();
    expect(screen.getByRole('button', { name: Strings.sweep.start.ko })).toBeTruthy();
  });
});
