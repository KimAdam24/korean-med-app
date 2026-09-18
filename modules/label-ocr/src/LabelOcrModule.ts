import { NativeModule, requireNativeModule } from 'expo';

import type { RecognizedLine } from './LabelOcr.types';

declare class LabelOcrModule extends NativeModule<{}> {
  /**
   * Reads Latin text from the image file at `uri`.
   *
   * The file must still exist when this is called and may be deleted as soon as
   * it resolves — no work is deferred past the returned promise.
   */
  recognizeTextAsync(uri: string): Promise<RecognizedLine[]>;
}

export default requireNativeModule<LabelOcrModule>('LabelOcr');
