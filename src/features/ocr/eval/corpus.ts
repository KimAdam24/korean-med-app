import type { RecognizedTextLine } from '../types.ts';
import { SYNTHETIC_CASES } from './corpus-synthetic.ts';
import type { EvalCase } from './score.ts';

/**
 * Label readings with the truth written down, for measuring the OCR pipeline
 * against labels rather than against the cases it was built from.
 *
 * Run `npm run eval` for the scorecard; `npm run test:unit` enforces it.
 *
 * ## Adding a label
 *
 * 1. Read the label in a development build, by camera or by choosing the
 *    photo. The engine's lines are logged between `[label-ocr] BEGIN` and
 *    `[label-ocr] END`; copy that JSON exactly as logged. It is in the
 *    engine's own order, with each line's frame and corners, which is what
 *    `reading-order` is measured on. (The raw-lines panel on the result screen
 *    shows lines *after* ordering, without geometry — not a substitute.)
 * 2. Write down what the label says — name, strength, directions — by reading
 *    the bottle, not the photo. Where the photo hides something the bottle
 *    shows, the bottle is the truth; that is what makes a hidden word a miss.
 * 3. Redact, as below, then add the entry with `redacted: true`.
 * 4. Run the suite. Set `expected` to what each field achieves now, so a later
 *    change cannot quietly make it worse.
 *
 * ## What never goes in
 *
 * The photograph. It is not needed — the pipeline after the engine sees only
 * lines, and the engine is not what this measures — and a photograph of a
 * dispensed label is a photograph of someone's prescription.
 *
 * The lines are that too, until redacted. Every line carrying the patient's
 * name or address, the prescriber, the pharmacy, an Rx number, a phone number
 * or a date is redacted *in shape*: each capital becomes `X`, each lower-case
 * letter `x`, each digit `0`, and punctuation and spacing stay. `RX #:123456`
 * becomes `RX #:000000`; `Jane Doe` becomes `Xxxx Xxx`.
 *
 * Shape matters because the parser reads shape. A redacted Rx line must still
 * look like an Rx line, and a redacted line cannot be deleted instead:
 * continuation joining depends on which lines are adjacent, so removing one
 * changes the result being measured. Geometry is left alone — where a line
 * sat identifies no one, and ordering depends on it. The drug, strength and
 * directions stay verbatim: they are what is being measured, and on their own
 * they identify no one.
 */

/**
 * A stock template label, read by the Android engine. Printed artwork rather
 * than a dispensed vial, so easier than a real label in every way that
 * matters: flat, evenly lit, no curvature, no fingers. Kept because its
 * misreads — `MOUTHUP`, `FOoD`, `aTY` — and its interleaved columns are real.
 *
 * Every line's confidence is null: this was captured while the Android module
 * discarded ML Kit's confidence, and it now stands in for an engine that
 * reports none. The names and addresses are the template's own.
 */
export const TEMPLATE_PILLNAMELOL_LINES: readonly RecognizedTextLine[] = [
  'ISSUED BY:',
  'NICOLE WILSON',
  'SMITH. NAME M.D.',
  '123 S. MAIN ST.',
  'V. MAIN ST.',
  'ROSWELL, NM 12345',
  'ROSWELL, NM 12345',
  'MAY CAUSE DROWSINESS: TAKE WITH',
  '300 MG PILLNAMELOL',
  'FOOD. ALCOHOL MAY INTENSIFY THIS',
  'TAKE 1 TABLET BY MOUTHUP TO 3 TIMES DAILY',
  'EFFECT. USE CAUTION WHEN OPERATING',
  'AS NEEDED. TAKE WITH FOoD.',
  'A MOVING VEHICLE OR DANGEROUS',
  'MACHINERY.',
  'aTY: 20',
  'Pharmacy ams',
  'REFILLS REMAINING: 1',
  'RX #:123456',
  'EDITABLE',
  'THMMD',
  'TEMPLATE,',
].map((text) => ({ text, confidence: null }));

/**
 * The vitamin D2 vial, first reading: captured before the engines returned
 * geometry, so the lines are in the order the old native code sorted them and
 * carry no boxes; `reading-order` passes them through untouched.
 *
 * The first three lines are the patient's name and address, redacted in shape
 * as the header describes. Everything else is verbatim, including the order:
 * the strength's tail `000 UNIT)` comes before its start `1.25MG(50,` — the old
 * native banding's doing, as the second reading's geometry showed. Confidence
 * is as reported, to two places.
 */
export const VITAMIN_D2_VIAL_NO_GEOMETRY_LINES: readonly RecognizedTextLine[] = [
  { text: 'Xxxx', confidence: 0.85 },
  { text: 'Xxx', confidence: 0.78 },
  { text: '00 0xx Xx, Xxxxxxxxx, XX 00000', confidence: 0.8 },
  { text: 'VITAMIN D2', confidence: 0.82 },
  { text: '000 UNIT)', confidence: 0.73 },
  { text: '1.25MG(50,', confidence: 0.82 },
  { text: 'Generic for: Calciferol,Drisdol', confidence: 0.78 },
  { text: 'Take 1 capsule (b', confidence: 0.77 },
  { text: 'units) by mouth eve', confidence: 0.66 },
  { text: 'days', confidence: 0.89 },
];

/**
 * The vitamin D2 vial again, read with geometry: the same photograph through a
 * build whose engines return each line's frame and corners, in the engine's
 * own order, exactly as logged. The first real test of `reading-order`.
 *
 * The photograph is tilted by about 8°: every top edge falls 0.10–0.18 px per
 * px to the right, left edges drift from 350 to 291 down the label, and the
 * corners are nowhere near rectangular. It shows the strength on two printed
 * lines, `1.25MG(50,` above `000 UNIT)`, not one line split by the curve.
 *
 * It found a bug on arrival: frames are axis-aligned, so on a tilted page the
 * frames of consecutive lines overlap, and the check for a wrapped
 * continuation — "directly below" — read `days` as another column's and
 * dropped it. That check now follows the corners.
 *
 * Lines 0–2 are the patient's name and address, redacted in shape; their
 * geometry is untouched. Confidence is as logged, to four places.
 */
export const VITAMIN_D2_VIAL_LINES: readonly RecognizedTextLine[] = [
  {
    text: "Xxxx",
    confidence: 0.8486,
    frame: { left: 350, top: 384, width: 96, height: 44 },
    corners: [{ x: 355, y: 384 }, { x: 446, y: 396 }, { x: 441, y: 428 }, { x: 350, y: 416 }],
  },
  {
    text: "Xxx",
    confidence: 0.7812,
    frame: { left: 348, top: 420, width: 57, height: 37 },
    corners: [{ x: 353, y: 420 }, { x: 405, y: 428 }, { x: 400, y: 457 }, { x: 348, y: 449 }],
  },
  {
    text: "00 0xx Xx, Xxxxxxxxx, XX 00000",
    confidence: 0.7977,
    frame: { left: 341, top: 453, width: 215, height: 46 },
    corners: [{ x: 344, y: 453 }, { x: 556, y: 484 }, { x: 553, y: 499 }, { x: 341, y: 468 }],
  },
  {
    text: "VITAMIN D2",
    confidence: 0.8216,
    frame: { left: 334, top: 480, width: 219, height: 67 },
    corners: [{ x: 340, y: 480 }, { x: 553, y: 513 }, { x: 547, y: 547 }, { x: 334, y: 514 }],
  },
  {
    text: "1.25MG(50,",
    confidence: 0.8195,
    frame: { left: 327, top: 517, width: 206, height: 74 },
    corners: [{ x: 335, y: 517 }, { x: 533, y: 552 }, { x: 525, y: 591 }, { x: 327, y: 556 }],
  },
  {
    text: "000 UNIT)",
    confidence: 0.7329,
    frame: { left: 321, top: 554, width: 183, height: 67 },
    corners: [{ x: 328, y: 554 }, { x: 504, y: 582 }, { x: 497, y: 621 }, { x: 321, y: 593 }],
  },
  {
    text: "Generic for: Calciferol,Drisdol",
    confidence: 0.7808,
    frame: { left: 318, top: 596, width: 223, height: 49 },
    corners: [{ x: 321, y: 596 }, { x: 541, y: 627 }, { x: 538, y: 645 }, { x: 318, y: 614 }],
  },
  {
    text: "Take 1 capsule (b",
    confidence: 0.7687,
    frame: { left: 310, top: 622, width: 287, height: 82 },
    corners: [{ x: 317, y: 622 }, { x: 597, y: 663 }, { x: 590, y: 704 }, { x: 310, y: 663 }],
  },
  {
    text: "units) by mouth eve",
    confidence: 0.657,
    frame: { left: 303, top: 675, width: 291, height: 68 },
    corners: [{ x: 308, y: 675 }, { x: 594, y: 705 }, { x: 589, y: 743 }, { x: 303, y: 713 }],
  },
  {
    text: "days",
    confidence: 0.8857,
    frame: { left: 291, top: 713, width: 80, height: 58 },
    corners: [{ x: 303, y: 713 }, { x: 371, y: 732 }, { x: 359, y: 771 }, { x: 291, y: 752 }],
  },
];

export const CORPUS: readonly EvalCase[] = [
  {
    id: 'vitamin-d2-vial',
    description:
      'Dispensed vial, handheld: tilted about 8°, glare, fingers over the directions, read ' +
      'with geometry. The name on a line of its own and the strength on two, with a ' +
      'Generic-for line beneath.',
    source: 'real-label',
    engine: 'android-mlkit',
    truth: {
      name: 'VITAMIN D2',
      // Both numbers, as printed and as the reader knows it. The metric alone
      // is right too, just less helpful; the parser tests pin the full form.
      dosage: ['1.25 MG (50,000 UNIT)', '1.25 MG'],
      // Read off the bottle. The 7 is under a finger in the photograph, so no
      // reading of this line has it: withheld is the best these can score.
      instructions: 'Take 1 capsule (50,000 units) by mouth every 7 days',
    },
    lines: VITAMIN_D2_VIAL_LINES,
    redacted: true,
    expected: { name: 'correct', dosage: 'correct', instructions: 'withheld' },
    // Name and strength are right, so one damaged field out of three: the
    // ordinary layout, with the directions marked damaged.
    expectedVerdict: 'ok',
  },
  {
    id: 'vitamin-d2-vial-no-geometry',
    description:
      'The same vial, first reading, before geometry: strength tail ordered first by the old ' +
      'native banding. The one that showed "Take 1 capsule (b units) by mouth eve days" as clean.',
    source: 'real-label',
    engine: 'android-mlkit',
    truth: {
      name: 'VITAMIN D2',
      // Both numbers, as printed and as the reader knows it. The metric alone
      // is right too, just less helpful; the parser tests pin the full form.
      dosage: ['1.25 MG (50,000 UNIT)', '1.25 MG'],
      // Read off the bottle. The 7 is under a finger in the photograph, so no
      // reading of this line has it: withheld is the best these can score.
      instructions: 'Take 1 capsule (50,000 units) by mouth every 7 days',
    },
    lines: VITAMIN_D2_VIAL_NO_GEOMETRY_LINES,
    redacted: true,
    expected: { name: 'correct', dosage: 'correct', instructions: 'withheld' },
    // Name and strength are right, so one damaged field out of three: the
    // ordinary layout, with the directions marked damaged.
    expectedVerdict: 'ok',
  },
  {
    id: 'template-pillnamelol',
    description: 'Stock template label on a flat surface, read by the Android engine.',
    source: 'template',
    engine: 'android-mlkit',
    truth: {
      name: 'PILLNAMELOL',
      dosage: '300 MG',
      instructions: 'TAKE 1 TABLET BY MOUTH UP TO 3 TIMES DAILY AS NEEDED. TAKE WITH FOOD.',
    },
    lines: TEMPLATE_PILLNAMELOL_LINES,
    expected: { name: 'correct', dosage: 'correct', instructions: 'withheld' },
    expectedVerdict: 'ok',
  },
  ...SYNTHETIC_CASES,
];
