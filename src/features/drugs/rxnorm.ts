/**
 * Resolving an NDC to an authoritative drug identity via RxNav (NLM).
 *
 * ## Why a lookup at all
 *
 * The spec is explicit that drug facts must come from an authoritative source
 * rather than be generated. A barcode gives a package code and nothing else —
 * no name, no strength, no ingredient. RxNorm is the US reference that turns
 * one into the other, it is free, and it needs no API key.
 *
 * ## The disclosure this makes, which is not nothing
 *
 * This is the only outbound request the app makes, and it necessarily tells the
 * National Library of Medicine that somebody looked up a particular medication.
 * Spec §4 says the user's data is theirs alone, so it is worth being precise
 * about what does and does not leave the device:
 *
 *   - Sent: one NDC, over HTTPS.
 *   - Not sent: any identifier for the user or the device, the medication
 *     profile, anything previously scanned, or any photograph.
 *
 * The request carries no cookie and no account, so NLM sees an unattributed
 * query from an IP address. That is a meaningfully smaller disclosure than a
 * cloud OCR service, which would receive the photograph itself — and it is the
 * reason barcode-first was the right primary path. It is still a disclosure,
 * and if it proves unacceptable the alternative is shipping an offline copy of
 * the NDC directory, which is large but not impossible.
 */

import { formatCms11 } from './ndc';

const RXNAV_ENDPOINT = 'https://rxnav.nlm.nih.gov/REST/ndcstatus.json';

/**
 * Long enough for a slow connection, short enough that an elderly user holding
 * a bottle up to a camera is not left staring at a spinner with no explanation.
 */
const REQUEST_TIMEOUT_MS = 8000;

export type DrugIdentity = {
  /** The 11-digit CMS code that actually resolved, in canonical form. */
  readonly ndc11: string;
  /** Formatted 5-4-2, as printed on the carton. */
  readonly ndcFormatted: string;
  /** RxNorm concept unique identifier — the handle for §3.4 interaction work. */
  readonly rxcui: string;
  /** RxNorm's name for the concept. English, verbatim, never translated here. */
  readonly name: string;
  /**
   * `OBSOLETE` means the package is discontinued, not that the match is wrong.
   * Surfaced rather than filtered: an elderly user may well be holding an old
   * bottle, and telling them the drug is unrecognised would be false.
   */
  readonly packageStatus: 'ACTIVE' | 'OBSOLETE';
};

export type NdcResolution =
  | { readonly status: 'identified'; readonly drug: DrugIdentity }
  /**
   * More than one candidate segmentation exists in RxNorm. Genuinely ambiguous:
   * the barcode cannot distinguish them and neither can we. The user has the
   * carton in their hand and can, so this must reach them as a question.
   */
  | { readonly status: 'ambiguous'; readonly matches: readonly DrugIdentity[] }
  /** No candidate is known to RxNorm. A real barcode, but not a US drug we can name. */
  | { readonly status: 'unknown' }
  /** The lookup could not be performed. Distinct from "not found" — retrying may work. */
  | { readonly status: 'offline' };

type NdcStatusPayload = {
  ndcStatus?: {
    ndc11?: string;
    status?: string;
    rxcui?: string;
    conceptName?: string;
  };
};

/**
 * Queries one candidate.
 *
 * Returns `null` for "RxNorm does not know this code" and throws only for
 * transport failures, so the caller can tell a definitive absence from a
 * failure to ask.
 */
async function lookupOne(ndc11: string, signal: AbortSignal): Promise<DrugIdentity | null> {
  const url = `${RXNAV_ENDPOINT}?ndc=${encodeURIComponent(ndc11)}`;
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`RxNav responded ${response.status}`);
  }

  const payload = (await response.json()) as NdcStatusPayload;
  const result = payload.ndcStatus;
  if (!result) return null;

  /**
   * Only `ACTIVE` and `OBSOLETE` are real package matches.
   *
   * `ALIEN` has to be rejected and it is not a formality. RxNav answers the
   * plainly invalid NDC `99999999999` with `status: "ALIEN"`, `rxnormNdc:
   * "NO"`, and `conceptName: "DIABETES PATIENT EDUCATION PACK"` — a response
   * that looks exactly like a successful identification. Accepting any status
   * with a name attached would let a misread barcode put a confident, entirely
   * fictitious entry into someone's medication profile.
   *
   * `UNKNOWN` simply means RxNorm has never heard of the code.
   */
  if (result.status !== 'ACTIVE' && result.status !== 'OBSOLETE') return null;

  // A status without a concept name cannot be presented to the user at all.
  if (!result.rxcui || !result.conceptName) return null;

  const resolved = result.ndc11 ?? ndc11;
  return {
    ndc11: resolved,
    ndcFormatted: formatCms11(resolved),
    rxcui: result.rxcui,
    name: result.conceptName,
    packageStatus: result.status,
  };
}

/**
 * Asks RxNorm which of the candidate segmentations is a real drug package.
 *
 * All candidates are queried rather than stopping at the first hit, because
 * stopping early would silently hide a genuine ambiguity — and reporting one
 * confident answer where two exist is precisely the failure mode that puts the
 * wrong medicine in someone's profile.
 */
export async function resolveNdcCandidates(
  candidates: readonly string[]
): Promise<NdcResolution> {
  if (candidates.length === 0) return { status: 'unknown' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const settled = await Promise.allSettled(
      candidates.map((candidate) => lookupOne(candidate, controller.signal))
    );

    // If every request failed at the transport level we never learned anything,
    // which is "offline" rather than "not found".
    if (settled.every((outcome) => outcome.status === 'rejected')) {
      return { status: 'offline' };
    }

    const matches: DrugIdentity[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled' && outcome.value) matches.push(outcome.value);
    }

    // Distinct candidates can normalise onto the same package; that is one drug,
    // not a conflict.
    const unique = new Map(matches.map((match) => [match.ndc11, match]));

    if (unique.size === 0) return { status: 'unknown' };
    if (unique.size === 1) {
      return { status: 'identified', drug: [...unique.values()][0] };
    }
    return { status: 'ambiguous', matches: [...unique.values()] };
  } finally {
    clearTimeout(timeout);
  }
}
