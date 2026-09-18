/**
 * Run with: npm run test:unit
 *
 * The check digit is computed here with the textbook left-to-right UPC-A rule,
 * which is a different formulation from the right-to-left weighting in `ndc.ts`.
 * Agreeing with a restatement of the spec is worth something; agreeing with a
 * copy of the implementation is worth nothing.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expandToCmsCandidates,
  extractGtinFromElementString,
  formatCms11,
  interpretBarcode,
  ndc10FromGtin,
  normaliseGtin,
} from './ndc.ts';

const GS = '\u001d';

/** Left-to-right UPC/GTIN check digit: odd positions ×3, even ×1, from the left of an odd-length body. */
function checkDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const value = Number(body[i]);
    // Position i+1: odd positions carry weight 3 for an odd-length body.
    sum += (i + body.length) % 2 === 0 ? value : value * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Builds the 12-digit UPC-A a US drug carton carries for a given 10-digit NDC. */
function upcAForNdc(ndc10: string): string {
  const body = `3${ndc10}`;
  return body + checkDigit(body);
}

/** The three real NDCs quoted in the RxNav documentation, one per segmentation. */
const FOUR_FOUR_TWO = { hyphenated: '0781-1506-10', ndc10: '0781150610', cms11: '00781150610' };
const FIVE_THREE_TWO = { hyphenated: '60429-324-77', ndc10: '6042932477', cms11: '60429032477' };
const FIVE_FOUR_ONE = { hyphenated: '11523-7020-1', ndc10: '1152370201', cms11: '11523702001' };

test('expands each segmentation to the documented CMS 11-digit code', () => {
  // Each padding rule must be reachable, and must land in the right place.
  assert.ok(expandToCmsCandidates(FOUR_FOUR_TWO.ndc10).includes(FOUR_FOUR_TWO.cms11));
  assert.ok(expandToCmsCandidates(FIVE_THREE_TWO.ndc10).includes(FIVE_THREE_TWO.cms11));
  assert.ok(expandToCmsCandidates(FIVE_FOUR_ONE.ndc10).includes(FIVE_FOUR_ONE.cms11));
});

test('every candidate is 11 digits and keeps the original digits in order', () => {
  // The only legal difference is a single zero inserted at the front, before
  // segment two, or before segment three. Deleting it must give the original
  // back — which also proves no digit was reordered or dropped along the way.
  const insertionPoints = [0, 5, 9];

  for (const ndc10 of [FOUR_FOUR_TWO.ndc10, FIVE_THREE_TWO.ndc10, FIVE_FOUR_ONE.ndc10]) {
    for (const candidate of expandToCmsCandidates(ndc10)) {
      assert.equal(candidate.length, 11);
      const recovered = insertionPoints.some(
        (at) => candidate[at] === '0' && candidate.slice(0, at) + candidate.slice(at + 1) === ndc10
      );
      assert.ok(recovered, `${candidate} is not ${ndc10} with one zero inserted`);
    }
  }
});

test('collapses duplicate candidates rather than faking ambiguity', () => {
  // 0000000000 expands identically under all three rules; reporting it three
  // times would make a single match look like a contested one.
  assert.deepEqual(expandToCmsCandidates('0000000000'), ['00000000000']);
});

test('rejects malformed input to the expander', () => {
  assert.deepEqual(expandToCmsCandidates('123'), []);
  assert.deepEqual(expandToCmsCandidates('12345678901'), []);
  assert.deepEqual(expandToCmsCandidates('abcdefghij'), []);
});

test('normalises a UPC-A and verifies its check digit', () => {
  const upc = upcAForNdc(FOUR_FOUR_TWO.ndc10);
  assert.equal(upc.length, 12);
  assert.equal(normaliseGtin(upc), upc.padStart(14, '0'));
});

test('an iOS 13-digit EAN and an Android 12-digit UPC-A scan to the same GTIN', () => {
  // AVFoundation reports UPC-A as EAN-13 with a leading zero; ML Kit reports 12
  // digits. The same bottle must not produce two different codes.
  const upc = upcAForNdc(FIVE_THREE_TWO.ndc10);
  assert.equal(normaliseGtin(upc), normaliseGtin(`0${upc}`));
  assert.equal(normaliseGtin(upc), normaliseGtin(`00${upc}`));
});

test('rejects a corrupted check digit instead of looking up the wrong drug', () => {
  const upc = upcAForNdc(FIVE_FOUR_ONE.ndc10);
  const wrongCheck = String((Number(upc[11]) + 1) % 10);
  const corrupted = upc.slice(0, 11) + wrongCheck;
  assert.throws(() => normaliseGtin(corrupted), /check digit/i);
});

test('pulls the NDC back out of a drug GTIN', () => {
  const gtin = normaliseGtin(upcAForNdc(FOUR_FOUR_TWO.ndc10));
  assert.equal(ndc10FromGtin(gtin), FOUR_FOUR_TWO.ndc10);
});

test('refuses to mine an NDC out of a non-drug GTIN', () => {
  // A grocery item's GTIN has digits in the same positions but no FDA labeler
  // code. Treating it as an NDC would invent a medication from a tin of beans.
  const body = '0123456789012';
  const gtin = body + checkDigit(body);
  assert.equal(ndc10FromGtin(gtin), null);
});

test('reads the GTIN out of a DSCSA DataMatrix element string', () => {
  const gtin = normaliseGtin(upcAForNdc(FIVE_THREE_TWO.ndc10));
  const payload = `01${gtin}1726093010LOT42${GS}21SERIAL7`;
  assert.equal(extractGtinFromElementString(payload), gtin);
});

test('finds the GTIN when it is not the first application identifier', () => {
  const gtin = normaliseGtin(upcAForNdc(FIVE_THREE_TWO.ndc10));
  // Fixed-length AI first...
  assert.equal(extractGtinFromElementString(`17260930` + `01${gtin}`), gtin);
  // ...and a variable-length one, which must be consumed up to its separator.
  assert.equal(extractGtinFromElementString(`10LOT42${GS}01${gtin}`), gtin);
});

test('tolerates the symbology identifier and a leading separator', () => {
  const gtin = normaliseGtin(upcAForNdc(FOUR_FOUR_TWO.ndc10));
  assert.equal(extractGtinFromElementString(`]d201${gtin}`), gtin);
  assert.equal(extractGtinFromElementString(`${GS}01${gtin}`), gtin);
});

test('returns null for a payload that is not an element string', () => {
  assert.equal(extractGtinFromElementString('307811506109'), null);
  assert.equal(extractGtinFromElementString('hello'), null);
  // Unterminated variable-length field: no way to know where it ends.
  assert.equal(extractGtinFromElementString('10LOT42'), null);
});

test('interprets a scanned drug UPC end to end', () => {
  const result = interpretBarcode({ type: 'upc_a', data: upcAForNdc(FIVE_FOUR_ONE.ndc10) });
  assert.equal(result.status, 'ndc-candidates');
  if (result.status !== 'ndc-candidates') return;
  assert.equal(result.ndc10, FIVE_FOUR_ONE.ndc10);
  assert.ok(result.candidates.includes(FIVE_FOUR_ONE.cms11));
  // All three segmentations are offered; only a lookup can say which is real.
  assert.equal(result.candidates.length, 3);
});

test('interprets a DataMatrix end to end', () => {
  const gtin = normaliseGtin(upcAForNdc(FOUR_FOUR_TWO.ndc10));
  const result = interpretBarcode({ type: 'datamatrix', data: `01${gtin}21ABC${GS}` });
  assert.equal(result.status, 'ndc-candidates');
  if (result.status !== 'ndc-candidates') return;
  assert.equal(result.ndc10, FOUR_FOUR_TWO.ndc10);
});

test('reports non-drug and unreadable codes distinctly', () => {
  const body = '0123456789012';
  assert.equal(interpretBarcode({ type: 'ean13', data: body + checkDigit(body) }).status, 'not-a-drug-code');

  // A QR code holding a URL is valid, just not a GTIN.
  assert.equal(interpretBarcode({ type: 'qr', data: 'https://example.com' }).status, 'unreadable');
  assert.equal(interpretBarcode({ type: 'upc_a', data: '' }).status, 'unreadable');
  assert.equal(interpretBarcode({ type: 'upc_a', data: '   ' }).status, 'unreadable');
});

test('never throws, whatever the scanner emits', () => {
  const nasty = ['', ' ', 'abc', '0', '9'.repeat(40), GS, `01${'9'.repeat(14)}`, ']d2', '\u0000'];
  for (const data of nasty) {
    assert.doesNotThrow(() => interpretBarcode({ type: 'datamatrix', data }));
  }
});

test('formats a CMS code the way a carton prints it', () => {
  assert.equal(formatCms11(FIVE_THREE_TWO.cms11), '60429-0324-77');
  // Anything unexpected passes through rather than being mangled into a
  // plausible-looking but wrong code.
  assert.equal(formatCms11('123'), '123');
});
