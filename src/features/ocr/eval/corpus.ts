import type { RecognizedTextLine } from '../types.ts';
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
 *    `[label-ocr] END`; copy that JSON. The raw-lines panel on the result
 *    screen shows the same thing.
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
 * changes the result being measured. The drug, strength and directions stay
 * verbatim — they are what is being measured, and on their own they identify
 * no one.
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

export const CORPUS: readonly EvalCase[] = [
  {
    id: 'vitamin-d2-vial',
    description:
      'Dispensed vial, handheld: curved surface, glare, fingers over the ' +
      'directions. Strength printed as 1.25MG(50,000 UNIT), possibly wrapped. ' +
      'The first real label; the one that showed the directions ' +
      '"Take 1 capsule (b units) by mouth eve days" as clean.',
    source: 'real-label',
    engine: null,
    truth: {
      name: 'VITAMIN D2',
      dosage: ['1.25 MG', '50,000 UNIT'],
      // N is the interval, to be read off the bottle — it is under a finger in
      // the photograph. Until it is filled in, no reading of this line can
      // match, so any directions shown as clean score as wrong. Given the
      // finger, that is also the truth.
      instructions: 'Take 1 capsule (50,000 units) by mouth every N days',
    },
    lines: null,
    expectedVerdict: 'degraded',
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
];
