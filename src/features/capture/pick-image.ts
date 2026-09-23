import * as ImagePicker from 'expo-image-picker';

/**
 * Choosing a photograph the user already has, as an alternative to taking one.
 *
 * ## Why this is a real path and not a fallback
 *
 * Framing a live shot while holding a pill bottle steady is hard with tremor or
 * arthritis, which describes a large share of this app's users. A photograph
 * taken in a good moment — possibly by somebody else, during a visit — is a
 * better input, not a worse one, and it reads better too: no motion blur, no
 * autofocus hunting.
 *
 * ## What is deleted, and what never is
 *
 * The picker does not hand over the user's file. It writes a full-resolution
 * copy into this app's cache — `ImagePicker/`, on both platforms — and returns
 * that. An earlier version of this comment said the image was "not copied",
 * which was wrong, and the copy was left behind. The copy is the app's, so it
 * is deleted once read (`discardPickedCopy`), as a camera capture is; the
 * original in the user's library is never touched. The §4 guarantee — the
 * image is never kept or sent — holds for both paths the same way.
 *
 * ## Permissions
 *
 * None are requested, and none are needed: the system photo picker runs out of
 * process and returns a single chosen item. The library plugin declares
 * `READ_EXTERNAL_STORAGE` anyway, which `app.json` blocks — declaring access we
 * do not use would put a storage permission on the store listing for nothing.
 */

export type PickedImage = {
  /**
   * The picker's copy in this app's cache — never the user's original. Delete
   * it with `discardPickedCopy` once read.
   */
  readonly uri: string;
  readonly width: number;
  readonly height: number;
};

/**
 * Opens the picker and returns the chosen image, or `null` if the user backed
 * out.
 *
 * @param runWithSystemUi Wrap the picker so the app's re-lock does not fire
 *   while it is open. The picker is another activity, and without this the lock
 *   tears down the screen waiting for the result — see `app-lock-context`.
 */
export async function pickImage(
  runWithSystemUi: <T>(action: () => Promise<T>) => Promise<T>
): Promise<PickedImage | null> {
  const result = await runWithSystemUi(() =>
    ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      // One bottle at a time. Multiple selection would need a queue and a way
      // to review each reading, which is a different feature.
      allowsMultipleSelection: false,
      /**
       * No cropping step. It is one more fiddly gesture between the user and
       * the result, and the recogniser reads the whole frame perfectly well —
       * cropping is a thing this audience would struggle with for no gain.
       */
      allowsEditing: false,
      /**
       * Full quality. The image is read once and discarded; re-encoding it
       * smaller would cost fine print on a pharmacy label, which is exactly
       * the text that matters.
       */
      quality: 1,
    })
  );

  if (result.canceled || result.assets.length === 0) return null;

  const [asset] = result.assets;
  return { uri: asset.uri, width: asset.width, height: asset.height };
}
