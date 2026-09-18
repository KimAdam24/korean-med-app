/**
 * UTF-8 ↔ bytes, implemented here rather than taken from the runtime.
 *
 * Expo's WinterCG runtime installs `TextDecoder`, `TextDecoderStream` and
 * `TextEncoderStream`, but *not* a bare `TextEncoder` (see
 * `expo/src/winter/runtime.native.ts`). Hermes does not reliably supply one
 * either, so the encode direction has no dependable global to lean on.
 *
 * Half a codec from the runtime and half from here would be worse than either:
 * the two halves could disagree about malformed input and we would only find
 * out when a user's dosage line came back as mojibake. Medication text is
 * Korean-heavy and round-trip fidelity is a correctness requirement, not a
 * nicety, so both directions live here and are tested together.
 *
 * Deliberately not exported through a barrel: only `secure-vault` should need
 * raw bytes, and keeping the surface small keeps the tested path small.
 */

/** Replacement character, emitted for any byte sequence that is not valid UTF-8. */
const REPLACEMENT = 0xfffd;

/**
 * Encodes a JS string to UTF-8 bytes.
 *
 * Lone surrogates — which a JS string can legally hold but UTF-8 cannot
 * represent — become U+FFFD rather than throwing. Refusing to save a record
 * because one character was unpaired would cost the user their medication entry
 * for no safety benefit; the corrupted character is visible, a lost record is not.
 */
export function utf8Encode(input: string): Uint8Array {
  // Worst case is 3 bytes per UTF-16 code unit (a BMP character); surrogate
  // pairs are 2 units producing 4 bytes, so this bound always holds.
  const out = new Uint8Array(input.length * 3);
  let at = 0;

  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : NaN;
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        i += 1;
      } else {
        code = REPLACEMENT;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // A trailing surrogate with no leader.
      code = REPLACEMENT;
    }

    if (code < 0x80) {
      out[at++] = code;
    } else if (code < 0x800) {
      out[at++] = 0xc0 | (code >> 6);
      out[at++] = 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      // Hangul lives here (AC00–D7A3), as do the jamo blocks.
      out[at++] = 0xe0 | (code >> 12);
      out[at++] = 0x80 | ((code >> 6) & 0x3f);
      out[at++] = 0x80 | (code & 0x3f);
    } else {
      out[at++] = 0xf0 | (code >> 18);
      out[at++] = 0x80 | ((code >> 12) & 0x3f);
      out[at++] = 0x80 | ((code >> 6) & 0x3f);
      out[at++] = 0x80 | (code & 0x3f);
    }
  }

  return out.subarray(0, at);
}

/**
 * Decodes UTF-8 bytes back to a JS string.
 *
 * Every malformed sequence yields one U+FFFD and resynchronises at the next
 * plausible lead byte. Overlong encodings, surrogate code points encoded as
 * three bytes (CESU-8), and values above U+10FFFF are all rejected — accepting
 * them is how a decoder becomes a way to smuggle one string past a check and
 * have it read as another.
 *
 * In practice this path only ever sees bytes we encrypted ourselves, so
 * malformed input means the ciphertext was tampered with or truncated. AES-GCM
 * authentication catches that first; this is the second line.
 */
export function utf8Decode(bytes: Uint8Array): string {
  // Chunked so a long medication list does not blow the argument limit on
  // String.fromCharCode, while still avoiding per-character concatenation.
  const units: number[] = [];
  const parts: string[] = [];
  let i = 0;

  const flush = () => {
    if (units.length === 0) return;
    parts.push(String.fromCharCode(...units));
    units.length = 0;
  };

  const push = (code: number) => {
    if (code > 0xffff) {
      const adjusted = code - 0x10000;
      units.push(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
    } else {
      units.push(code);
    }
    if (units.length >= 1024) flush();
  };

  while (i < bytes.length) {
    const lead = bytes[i];

    if (lead < 0x80) {
      push(lead);
      i += 1;
      continue;
    }

    const width = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 0;

    // `width === 0` means a continuation byte appeared where a lead was due.
    if (width === 0) {
      push(REPLACEMENT);
      i += 1;
      continue;
    }

    let code = lead & (0xff >> (width + 1));
    // Counts the bytes this sequence consumed, so a failure can resynchronise
    // on the byte that actually broke it. Advancing by a flat 1 instead would
    // re-read continuation bytes we already accepted and emit a second
    // replacement character that `TextDecoder` does not.
    let consumed = 1;
    let valid = true;
    for (; consumed < width; consumed += 1) {
      // Truncated by the end of input: everything so far was well-formed, so
      // this is one bad character, not one per leftover byte.
      if (i + consumed >= bytes.length) {
        valid = false;
        break;
      }
      const cont = bytes[i + consumed];
      if ((cont & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      code = (code << 6) | (cont & 0x3f);
    }

    if (!valid) {
      push(REPLACEMENT);
      i += consumed;
      continue;
    }

    const overlong =
      (width === 2 && code < 0x80) ||
      (width === 3 && code < 0x800) ||
      (width === 4 && code < 0x10000);
    const surrogate = code >= 0xd800 && code <= 0xdfff;
    const tooLarge = code > 0x10ffff;

    if (overlong || surrogate || tooLarge) {
      push(REPLACEMENT);
      i += 1;
      continue;
    }

    push(code);
    i += width;
  }

  flush();
  return parts.join('');
}
