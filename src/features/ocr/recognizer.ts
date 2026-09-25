import type { TransientImage } from '@/features/capture/transient-capture';

import type { LabelRecognitionResult } from './types';

/**
 * A label-reading engine.
 *
 * Lives here rather than beside `recognizeLabel` so that an engine can be
 * written without importing the module that selects one. That keeps
 * `recognize-label` free to depend on the default engine directly, which is
 * what makes the wiring static rather than something a side effect has to
 * install at the right moment.
 */
export type LabelRecognizer = (
  image: TransientImage
) => Promise<LabelRecognitionResult>;
