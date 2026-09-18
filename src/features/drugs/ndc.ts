/**
 * Turning a scanned barcode into National Drug Codes worth looking up.
 *
 * US drug packages carry the NDC inside a GS1 identifier rather than as plain
 * text: a linear UPC-A is `3` + the 10-digit NDC + a check digit, and the
 * 2D DataMatrix mandated by DSCSA carries a GTIN-14 in application identifier
 * `(01)`, which is the same GTIN-12 zero-padded to fourteen.
 *
 * ## The ambiguity this module refuses to resolve on its own
 *
 * A 10-digit NDC is segmented as 4-4-2, 5-3-2 or 5-4-1, and which one it is
 * determines where the padding zero goes when converting to the 11-digit CMS
 * form that lookups use. The segmentation is printed on the carton with
 * hyphens — and is completely absent from the barcode digits.
 *
 * So ten digits from a scan yield up to three plausible 11-digit codes, and
 * nothing local can tell them apart. Picking the most likely one would be a
 * guess about which medicine the user is holding, which is exactly the class of
 * bug this app cannot ship. `expandToCmsCandidates` therefore returns all of
 * them, and `features/drugs/rxnorm` asks an authoritative source which actually
 * exists. If more than one does, the caller must ask the user rather than
 * choose.
 */

/** A GS1 check digit failed, so the read is corrupt rather than merely unknown. */
export class InvalidBarcodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBarcodeError';
  }
}

/**
 * The separator a GS1 element string uses to terminate a variable-length field.
 * Scanners surface FNC1 as ASCII 29 (GS).
 */
const GROUP_SEPARATOR = '\u001d';

/**
 * Application identifiers we need to step over to reach `(01)`, mapped to the
 * length of their data. Only fixed-length AIs can be skipped blindly; anything
 * else has to be terminated by a separator.
 *
 * Deliberately not exhaustive — it covers the AIs that actually appear on a
 * DSCSA-serialised drug package (expiry, lot, serial, production date).
 */
const FIXED_LENGTH_AIS: Record<string, number> = {
  '00': 18,
  '01': 14,
  '02': 14,
  '11': 6,
  '13': 6,
  '15': 6,
  '17': 6,
};

/**
 * Computes the GS1 mod-10 check digit over `digits`, which must exclude the
 * check digit itself. Weights alternate 3,1,3,1… from the rightmost character.
 */
function gs1CheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const value = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += i % 2 === 0 ? value * 3 : value;
  }
  return (10 - (sum % 10)) % 10;
}

function isDigits(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

/**
 * Reduces any GTIN-8/12/13/14 to a bare 14-digit GTIN, verifying the check
 * digit on the way.
 *
 * The leading-zero normalisation matters more than it looks: iOS reports a
 * UPC-A through AVFoundation as a 13-digit EAN with a leading zero, while
 * Android's ML Kit reports the same label as 12 digits. Without this, the same
 * bottle scans to two different codes depending on the phone.
 *
 * @throws InvalidBarcodeError if the check digit does not verify.
 */
export function normaliseGtin(raw: string): string {
  const trimmed = raw.trim();
  if (!isDigits(trimmed) || trimmed.length < 8 || trimmed.length > 14) {
    throw new InvalidBarcodeError(`Not a GTIN: ${raw}`);
  }

  const padded = trimmed.padStart(14, '0');
  const body = padded.slice(0, 13);
  const check = padded.charCodeAt(13) - 48;

  if (gs1CheckDigit(body) !== check) {
    throw new InvalidBarcodeError(`GTIN check digit failed: ${raw}`);
  }
  return padded;
}

/**
 * Pulls the `(01)` GTIN out of a GS1 element string, as found in the DataMatrix
 * on a US drug carton.
 *
 * Returns `null` when the payload is not a GS1 element string at all, which is
 * the common case for a plain retail UPC and not an error.
 */
export function extractGtinFromElementString(payload: string): string | null {
  // Some scanners prefix the symbology identifier; others emit a leading FNC1.
  let rest = payload.replace(/^\]d2/i, '').replace(/^\u001d/, '');

  while (rest.length >= 2) {
    const ai = rest.slice(0, 2);
    const fixed = FIXED_LENGTH_AIS[ai];

    if (fixed !== undefined) {
      const data = rest.slice(2, 2 + fixed);
      if (data.length < fixed) return null;
      if (ai === '01') return data;
      rest = rest.slice(2 + fixed);
      // A separator here is permitted but not required after a fixed-length AI.
      if (rest.startsWith(GROUP_SEPARATOR)) rest = rest.slice(1);
      continue;
    }

    // Variable-length field: it runs to the next separator, or to the end.
    const end = rest.indexOf(GROUP_SEPARATOR);
    if (end === -1) return null;
    rest = rest.slice(end + 1);
  }

  return null;
}

/**
 * Extracts the 10-digit NDC embedded in a GTIN-14, or `null` if this GTIN does
 * not carry one.
 *
 * A US drug GTIN-14 looks like `00` + `3` + NDC10 + check digit. The `3` is the
 * marker that the GS1 company prefix wraps an FDA labeler code; a GTIN without
 * it belongs to some other product and must not be mined for digits that happen
 * to be in the right position.
 */
export function ndc10FromGtin(gtin14: string): string | null {
  if (gtin14.length !== 14) return null;
  if (!gtin14.startsWith('003')) return null;
  return gtin14.slice(3, 13);
}

/**
 * Expands a 10-digit NDC into every 11-digit CMS code it could represent.
 *
 * The three segmentations pad in different places:
 *   4-4-2 → a zero at the front       (0781150610 → 00781150610)
 *   5-3-2 → a zero before segment two (6042932477 → 60429032477)
 *   5-4-1 → a zero before segment three
 *
 * Duplicates are collapsed, because a code whose digits already start with zero
 * can expand identically under more than one rule, and offering the same
 * candidate twice would make an unambiguous match look contested.
 */
export function expandToCmsCandidates(ndc10: string): string[] {
  if (ndc10.length !== 10 || !isDigits(ndc10)) return [];

  const asFourFourTwo = `0${ndc10}`;
  const asFiveThreeTwo = `${ndc10.slice(0, 5)}0${ndc10.slice(5)}`;
  const asFiveFourOne = `${ndc10.slice(0, 9)}0${ndc10.slice(9)}`;

  return [...new Set([asFourFourTwo, asFiveThreeTwo, asFiveFourOne])];
}

export type ScannedBarcode = {
  /** `BarcodeType` from expo-camera, e.g. `upc_a`, `ean13`, `datamatrix`. */
  readonly type: string;
  readonly data: string;
};

export type BarcodeInterpretation =
  | {
      readonly status: 'ndc-candidates';
      readonly ndc10: string;
      /** One to three 11-digit CMS codes, exactly one of which should exist. */
      readonly candidates: readonly string[];
    }
  /** A valid barcode that is not a US drug code — a loyalty card, a food item. */
  | { readonly status: 'not-a-drug-code' }
  /** The symbol did not decode to something structurally valid. */
  | { readonly status: 'unreadable' };

/**
 * The whole barcode → candidate pipeline, in one call.
 *
 * Never throws: a bad check digit is reported as `unreadable` so the camera can
 * simply keep scanning. A scan that cannot be trusted is indistinguishable, to
 * the user, from not having scanned yet — and that is the correct experience.
 */
export function interpretBarcode(barcode: ScannedBarcode): BarcodeInterpretation {
  const payload = barcode.data?.trim();
  if (!payload) return { status: 'unreadable' };

  let gtin: string;
  try {
    // A 2D symbol carries a GS1 element string; a linear one is the GTIN itself.
    const fromElementString = extractGtinFromElementString(payload);
    gtin = normaliseGtin(fromElementString ?? payload);
  } catch (error) {
    return { status: error instanceof InvalidBarcodeError ? 'unreadable' : 'unreadable' };
  }

  const ndc10 = ndc10FromGtin(gtin);
  if (!ndc10) return { status: 'not-a-drug-code' };

  const candidates = expandToCmsCandidates(ndc10);
  if (candidates.length === 0) return { status: 'not-a-drug-code' };

  return { status: 'ndc-candidates', ndc10, candidates };
}

/** Formats an 11-digit CMS code as 5-4-2, for display next to the drug name. */
export function formatCms11(ndc11: string): string {
  if (ndc11.length !== 11) return ndc11;
  return `${ndc11.slice(0, 5)}-${ndc11.slice(5, 9)}-${ndc11.slice(9)}`;
}
