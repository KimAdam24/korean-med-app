package expo.modules.labelocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.exception.CodedException
// `Coroutine` is a top-level infix extension on AsyncFunctionBuilder, not a
// member of the definition DSL, so it has to be imported explicitly. Without
// this the call parses as an unresolved reference and the lambda is never a
// suspend context, which is why omitting it also breaks every `suspend` call
// inside the block.
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * On-device text recognition for medication labels (spec §3.1, OCR fallback).
 *
 * Uses Google's ML Kit through Google Play Services rather than the bundled
 * model: the recognition still happens entirely on the device, but the model
 * is shared with the OS instead of adding roughly 38 MB to the APK. The image
 * never leaves the handset, which is what spec §4 requires and what ruled out
 * a cloud OCR service.
 */

internal class ImageUnreadableException(uri: String, cause: Throwable?) :
  CodedException("The image at $uri could not be read. It may already have been deleted.", cause)

internal class RecognitionFailedException(cause: Throwable?) :
  CodedException("Text recognition failed.", cause)

internal class MissingContextException :
  CodedException("The Android context was unavailable, so the label could not be read.")

class LabelOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LabelOcr")

    /**
     * Reads Latin text from the image at `uri`.
     *
     * `Coroutine` suspends rather than blocking, so the JS thread is free while
     * ML Kit works. The caller passes a URI whose file exists only for the
     * duration of the surrounding `withTransientCapture` window, so no work may
     * be deferred past this function's return.
     */
    AsyncFunction("recognizeTextAsync") Coroutine { uri: String ->
      val context = appContext.reactContext ?: throw MissingContextException()

      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (cause: Throwable) {
        throw ImageUnreadableException(uri, cause)
      }

      // DEFAULT_OPTIONS is the Latin script recognizer. Other scripts are
      // separate models and separate dependencies; only Latin is bundled here
      // because these users read English labels — see the README.
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

      try {
        // Explicit type parameter rather than inference: the callback shape of
        // Task<Text> gives the compiler no direct return to infer from, and a
        // silent widening here would surface as a confusing error deep in the
        // mapping below rather than at its cause.
        val recognised = suspendCancellableCoroutine<Text> { continuation ->
          recognizer
            .process(image)
            .addOnSuccessListener { continuation.resume(it) }
            .addOnFailureListener { continuation.resumeWithException(RecognitionFailedException(it)) }
        }

        /**
         * Flattened and re-sorted rather than returned in ML Kit's block
         * grouping. Apple's Vision produces a different grouping for the same
         * label, and everything above this boundary is written against one
         * shape — the sig parser must not have to know which engine ran.
         *
         * ML Kit's `boundingBox` has its origin at the top left, so ascending
         * `top` is reading order. It is nullable; entries without one are sorted
         * last rather than dropped, since the text is still worth having.
         */
        return@Coroutine recognised.textBlocks
          .flatMap { block -> block.lines }
          .sortedWith(
            // Receiver named explicitly so the selector lambdas have a type to
            // resolve `boundingBox` against; `compareBy` is a vararg of lambdas
            // and infers poorly in the middle of a chain.
            compareBy<Text.Line>(
              { it.boundingBox?.top ?: Int.MAX_VALUE },
              { it.boundingBox?.left ?: Int.MAX_VALUE }
            )
          )
          .mapNotNull { line ->
            val text = line.text.trim()
            if (text.isEmpty()) {
              null
            } else {
              /**
               * `confidence` is always null on Android. ML Kit's documented
               * `Text.Line` surface exposes text and geometry but no per-line
               * confidence, so there is nothing honest to report. iOS supplies
               * a real 0..1 value from Vision.
               *
               * Consumers must therefore treat a missing confidence as "unknown"
               * and not as "good" — `features/ocr/types` keys the
               * user-confirmation prompt off exactly that.
               */
              // Typed explicitly: inference would settle on Map<String, String?>
              // from these two entries, which is both misleading about the
              // contract and wrong the moment a numeric confidence appears.
              mapOf<String, Any?>("text" to text, "confidence" to null)
            }
          }
      } finally {
        recognizer.close()
      }
    }
  }
}
