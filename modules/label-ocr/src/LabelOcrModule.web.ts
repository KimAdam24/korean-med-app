import { NativeModule, registerWebModule } from 'expo';

import type { RecognizedLine } from './LabelOcr.types';

/**
 * There is no on-device recogniser on web, and there will not be one: the only
 * way to read a label in a browser is to send the image somewhere, which spec
 * §4 forbids.
 *
 * Rejecting is deliberate rather than returning an empty array. No lines found
 * means "we looked and the label was unreadable", which would send the user off
 * to find better light for a photo that was never going to be read at all.
 */
class LabelOcrModule extends NativeModule<{}> {
  async recognizeTextAsync(): Promise<RecognizedLine[]> {
    throw new Error('Label reading is not available on the web.');
  }
}

export default registerWebModule(LabelOcrModule, 'LabelOcrModule');
