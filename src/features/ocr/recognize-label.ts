import type { TransientImage } from '@/features/capture/transient-capture';

import type { LabelRecognitionResult } from './types';

/**
 * Seam for spec §3.1. No recognizer ships yet — `recognizeLabel` reports
 * `not-configured` rather than inventing plausible-looking medication data,
 * because a fake dose that reaches the medication profile is indistinguishable
 * from a real one once it is there.
 *
 * A recognizer must satisfy the contract in
 * {@link TransientImage}: read the pixels, return text, retain nothing.
 */
export type LabelRecognizer = (image: TransientImage) => Promise<LabelRecognitionResult>;

let recognizer: LabelRecognizer | null = null;

export function setLabelRecognizer(next: LabelRecognizer | null): void {
  recognizer = next;
}

export async function recognizeLabel(image: TransientImage): Promise<LabelRecognitionResult> {
  if (!recognizer) return { status: 'not-configured' };
  return recognizer(image);
}
