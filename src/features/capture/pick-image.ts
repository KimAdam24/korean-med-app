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
 * ## Why the user's file is never touched
 *
 * `withTransientCapture` owns the photograph it takes and deletes it, because
 * the app created it. This is the opposite case: the file belongs to the user
 * and predates us. It is read and nothing else — not copied, not moved, and
 * emphatically not deleted. The §4 guarantee was never really "photos are
 * deleted"; it is "the image is never kept or sent", which holds for both paths
 * by different means.
 *
 * ## Permissions
 *
 * None are requested, and none are needed: the system photo picker runs out of
 * process and returns a single chosen item. The library plugin declares
 * `READ_EXTERNAL_STORAGE` anyway, which `app.json` blocks — declaring access we
 * do not use would put a storage permission on the store listing for nothing.
 */

export type PickedImage = {
  /** A file URI the recogniser can read. Belongs to the user; do not delete it. */
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
