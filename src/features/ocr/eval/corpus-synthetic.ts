import type { RecognizedTextLine } from '../types.ts';
import type { EvalCase } from './score.ts';

/**
 * Synthetic label readings: lines written by hand to the shapes real labels
 * take, for coverage the two real captures do not give yet.
 *
 * ## What these are, and are not
 *
 * They are not OCR output. No engine produced them, so they cannot say how
 * often a misread happens or what it looks like — only whether the pipeline
 * does the right thing with a shape once it arrives. Each one isolates a
 * shape: a unit format, a layout, a wrap, a column, a curve. Where one is
 * deliberately damaged, the damage is modelled on a misread the real captures
 * showed.
 *
 * The truth is what the imagined label prints. An expected outcome of
 * `withheld` is a design decision recorded, not a gap to close: a combination
 * product's strength, or an all-caps wrap with no geometry, is withheld on
 * purpose.
 *
 * Patient, prescriber and pharmacy lines use the in-shape redaction the real
 * corpus uses, so they exercise the same classification.
 */

const plain = (...texts: string[]): RecognizedTextLine[] =>
  texts.map((text) => ({ text, confidence: null }));

/**
 * A line with geometry: its top edge starts at (left, top) and rises or falls
 * by `slope` per pixel, the shape an engine reports on a tilted or curved
 * surface. Image y grows downwards.
 */
function laidOut(
  text: string,
  left: number,
  top: number,
  width: number,
  height = 20,
  slope = 0
): RecognizedTextLine {
  const rise = slope * width;
  return {
    text,
    confidence: null,
    frame: { left, top: Math.min(top, top + rise), width, height: height + Math.abs(rise) },
    corners: [
      { x: left, y: top },
      { x: left + width, y: top + rise },
      { x: left + width, y: top + rise + height },
      { x: left, y: top + height },
    ],
  };
}

/** Returns the lines in a fixed scrambled order, as an engine might. */
function engineOrder<T>(items: readonly T[], order: readonly number[]): T[] {
  return order.map((index) => items[index]);
}

export const SYNTHETIC_CASES: readonly EvalCase[] = [
  {
    id: 'synthetic-chain-lisinopril',
    description: 'Chain-pharmacy layout, all capitals, one-line directions, a manufacturer line.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['LISINOPRIL TABLET', 'LISINOPRIL'],
      dosage: '10 MG',
      instructions: 'TAKE 1 TABLET BY MOUTH EVERY DAY',
    },
    lines: plain(
      'XXX PHARMACY #0000',
      'XXXX XXXXXXX',
      'RX# 0000000',
      'LISINOPRIL 10 MG TABLET',
      'TAKE 1 TABLET BY MOUTH EVERY DAY',
      'QTY: 30',
      'REFILLS: 3',
      'MFG: XXXXX',
      'DR. XXXXXXX'
    ),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-title-case-metformin',
    description: 'Title-case layout with the salt in the name and a quantity without a colon.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['Metformin HCl tablet', 'Metformin HCl'],
      dosage: '500 MG',
      instructions: 'Take 1 tablet by mouth twice daily with meals',
    },
    lines: plain(
      'Xxxxxxxxx',
      'Metformin HCl 500 mg tablet',
      'Take 1 tablet by mouth twice daily with meals',
      'Qty 60',
      'Refills 5'
    ),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-vitamin-d3-iu',
    description: 'International units with a thousands separator, weekly dosing.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['VITAMIN D3 CAPSULE', 'VITAMIN D3'],
      dosage: '50,000 IU',
      instructions: 'TAKE 1 CAPSULE BY MOUTH ONCE A WEEK',
    },
    lines: plain('VITAMIN D3 50,000 IU CAPSULE', 'TAKE 1 CAPSULE BY MOUTH ONCE A WEEK', 'QTY: 4'),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-potassium-meq',
    description: 'Milliequivalents, extended release, directions naming food.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['POTASSIUM CL ER TAB', 'POTASSIUM CL ER'],
      dosage: '20 MEQ',
      instructions: 'TAKE 1 TABLET BY MOUTH TWICE DAILY WITH FOOD',
    },
    lines: plain('POTASSIUM CL ER 20 MEQ TAB', 'TAKE 1 TABLET BY MOUTH TWICE DAILY WITH FOOD'),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-cream-percent',
    description:
      'A percentage strength, and an as-needed line that carries a warning after it — the line ' +
      'that was once classified as a warning and took "as needed" with it.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['HYDROCORTISONE CREAM', 'HYDROCORTISONE'],
      dosage: '2.5 %',
      instructions: [
        'APPLY TO AFFECTED AREA TWICE DAILY AS NEEDED. FOR EXTERNAL USE ONLY.',
        'APPLY TO AFFECTED AREA TWICE DAILY AS NEEDED',
      ],
    },
    lines: plain(
      'HYDROCORTISONE 2.5% CREAM',
      'APPLY TO AFFECTED AREA TWICE DAILY',
      'AS NEEDED. FOR EXTERNAL USE ONLY.'
    ),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-eye-drops-percent',
    description: 'A decimal percentage below one, eye drops at bedtime.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['LATANOPROST SOLN', 'LATANOPROST'],
      dosage: '0.005 %',
      instructions: 'INSTILL 1 DROP IN EACH EYE AT BEDTIME',
    },
    lines: plain('LATANOPROST 0.005% SOLN', 'INSTILL 1 DROP IN EACH EYE AT BEDTIME'),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-insulin-concentration',
    description: 'A concentration, which must never be shown as the dose to inject.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['INSULIN GLARGINE PEN', 'INSULIN GLARGINE'],
      dosage: '100 UNITS/ML',
      instructions: 'INJECT 20 UNITS UNDER THE SKIN AT BEDTIME',
    },
    lines: plain('INSULIN GLARGINE 100 UNITS/ML PEN', 'INJECT 20 UNITS UNDER THE SKIN AT BEDTIME'),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-suspension-per-5ml',
    description: 'A liquid concentration per 5 mL, dosed in millilitres for ten days.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['AMOXICILLIN SUSP', 'AMOXICILLIN'],
      dosage: '400 MG/5 ML',
      instructions: 'GIVE 5 ML BY MOUTH TWICE DAILY FOR 10 DAYS',
    },
    lines: plain('AMOXICILLIN 400 MG/5 ML SUSP', 'GIVE 5 ML BY MOUTH TWICE DAILY FOR 10 DAYS'),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-combination-product',
    description:
      'A combination strength written with a slash, read whole. Either half alone would be a ' +
      'strength the tablet does not have.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['HYDROCODONE/APAP TAB', 'HYDROCODONE/APAP'],
      dosage: '5/325 MG',
      instructions: 'TAKE 1 TABLET BY MOUTH EVERY 6 HOURS AS NEEDED FOR PAIN',
    },
    lines: plain(
      'HYDROCODONE/APAP 5/325 MG TAB',
      'TAKE 1 TABLET BY MOUTH EVERY 6 HOURS AS NEEDED FOR PAIN'
    ),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-combination-hyphen',
    description:
      'A combination strength written with a hyphen, which reads the same as a range. Name and ' +
      'strength are withheld by design.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['AMOXICILLIN-CLAV TAB', 'AMOXICILLIN-CLAV'],
      dosage: '875-125 MG',
      instructions: 'TAKE 1 TABLET BY MOUTH TWICE DAILY FOR 10 DAYS',
    },
    lines: plain('AMOXICILLIN-CLAV 875-125 MG TAB', 'TAKE 1 TABLET BY MOUTH TWICE DAILY FOR 10 DAYS'),
    expected: { name: 'withheld', dosage: 'withheld', instructions: 'correct' },
  },
  {
    id: 'synthetic-all-caps-wrap-no-geometry',
    description:
      'All-caps directions wrapped onto a second line, with no geometry to say whether the ' +
      'second line is theirs. Withheld by design: dropped, it turns a limit into a schedule.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['OXYCODONE TAB', 'OXYCODONE'],
      dosage: '5 MG',
      instructions: 'TAKE 1 TABLET BY MOUTH EVERY 4 HOURS IF NEEDED FOR PAIN',
    },
    lines: plain('OXYCODONE 5 MG TAB', 'TAKE 1 TABLET BY MOUTH EVERY 4 HOURS', 'IF NEEDED FOR PAIN'),
    expected: { name: 'correct', dosage: 'correct', instructions: 'withheld' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-all-caps-wrap-with-geometry',
    description:
      'The same wrap with geometry, in a scrambled engine order: the tail sits directly below ' +
      'on the same left edge, so it is joined.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['OXYCODONE TAB', 'OXYCODONE'],
      dosage: '5 MG',
      instructions: 'TAKE 1 TABLET BY MOUTH EVERY 4 HOURS IF NEEDED FOR PAIN',
    },
    lines: engineOrder(
      [
        laidOut('OXYCODONE 5 MG TAB', 20, 40, 300),
        laidOut('TAKE 1 TABLET BY MOUTH EVERY 4 HOURS', 20, 80, 420),
        laidOut('IF NEEDED FOR PAIN', 20, 104, 220),
        laidOut('QTY: 20', 20, 150, 120),
      ],
      [2, 0, 3, 1]
    ),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-two-columns-with-geometry',
    description:
      'A warning sticker in a left column beside the directions on the right, sharing rows. ' +
      'The sticker’s lowercase wrap must not be joined into the directions.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['DOXYCYCLINE HYCLATE CAP', 'DOXYCYCLINE HYCLATE'],
      dosage: '100 MG',
      instructions: 'Take 1 capsule by mouth twice daily',
    },
    lines: engineOrder(
      [
        laidOut('DOXYCYCLINE HYCLATE 100 MG CAP', 300, 40, 320),
        laidOut('Do not take with', 0, 100, 200),
        laidOut('Take 1 capsule by mouth', 300, 100, 260),
        laidOut('antacids or iron', 0, 124, 200),
        laidOut('twice daily', 300, 124, 140),
      ],
      [4, 1, 0, 3, 2]
    ),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-curved-vial',
    description:
      'The real vial’s shape with geometry: the name on its own line, the strength broken in ' +
      'two along a curve with its tail raised, a Generic-for landmark, wrapped directions.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: 'VITAMIN D2',
      dosage: ['1.25 MG (50,000 UNIT)', '1.25 MG'],
      instructions: 'Take 1 capsule by mouth every 7 days',
    },
    lines: engineOrder(
      [
        laidOut('VITAMIN D2', 0, 50, 180, 30),
        laidOut('1.25MG(50,', 0, 100, 200, 20, -0.04),
        laidOut('000 UNIT)', 210, 91.5, 120, 20, -0.12),
        laidOut('Generic for: Calciferol,Drisdol', 0, 130, 300),
        laidOut('Take 1 capsule by mouth', 0, 170, 260),
        laidOut('every 7 days', 0, 194, 140),
      ],
      [2, 0, 5, 3, 1, 4]
    ),
    expected: { name: 'correct', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-lost-ceiling',
    description:
      'Directions whose "up to 3" was lost to a misread — the damage the first template showed, ' +
      'in another form. Must be withheld, never shown as a daily schedule.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['IBUPROFEN TAB', 'IBUPROFEN'],
      dosage: '800 MG',
      instructions: 'TAKE 1 TABLET BY MOUTH UP TO 3 TIMES DAILY AS NEEDED',
    },
    lines: plain('IBUPROFEN 800 MG TAB', 'TAKE 1 TABLET BY MOUTH UP TO TIMES DAILY AS NEEDED'),
    expected: { name: 'correct', dosage: 'correct', instructions: 'withheld' },
    expectedVerdict: 'ok',
  },
  {
    id: 'synthetic-quantity-on-product-line',
    description: 'The quantity printed on the product line itself, which must not become the name.',
    source: 'synthetic',
    engine: null,
    truth: {
      name: ['ATORVASTATIN', 'ATORVASTATIN TAB'],
      dosage: '40 MG',
      instructions: 'TAKE 1 TABLET BY MOUTH AT BEDTIME',
    },
    lines: plain('ATORVASTATIN 40 MG QTY: 90', 'TAKE 1 TABLET BY MOUTH AT BEDTIME'),
    expected: { name: 'withheld', dosage: 'correct', instructions: 'correct' },
    expectedVerdict: 'ok',
  },
];
