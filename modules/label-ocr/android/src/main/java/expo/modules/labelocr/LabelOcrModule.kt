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
         * Flattened out of ML Kit's block grouping, in the order ML Kit
         * returned it, with each line's geometry.
         *
         * This module used to sort lines into reading order itself. That moved
         * to TypeScript (`src/features/ocr/reading-order.ts`): ordering is a
         * heuristic that has to be tuned against real labels — curved vials
         * above all — and only there can it be tested against geometry
         * recorded from them. Native code now reports what the engine saw and
         * decides nothing.
         */
        return@Coroutine recognised.textBlocks
          .flatMap { block -> block.lines }
          .mapNotNull { line -> describeLine(line) }
      } finally {
        recognizer.close()
      }
    }
  }
}

/**
 * One line as JavaScript receives it: text, confidence and geometry, or null
 * for a line with no text.
 *
 * Coordinates are pixels in the image as ML Kit processed it, origin top left.
 * Both geometry fields are nullable in ML Kit's API and are passed on as null
 * rather than invented; a line without geometry still carries its text, and
 * the ordering code places it last.
 *
 * Public so that the sweep (`modules/label-sweep`) reports lines in exactly
 * this shape: the TypeScript side treats a sweep frame and a photograph the
 * same, and two copies of this mapping would drift.
 */
fun describeLine(line: Text.Line): Map<String, Any?>? {
  val text = line.text.trim()
  if (text.isEmpty()) return null

  val box = line.boundingBox

  // Typed explicitly so the map's value type is not inferred from whichever
  // entry happens to come first.
  return mapOf<String, Any?>(
    "text" to text,
    /**
     * `Text.Line.getConfidence()` is a float in [0, 1] — documented in the API
     * reference, which this module once overlooked and sent null instead.
     *
     * The same reference says it returns 0 when the information is
     * unavailable: the unbundled recogniser on Play services older than
     * 22.30. A recognised line never genuinely scores exactly 0, so 0 is sent
     * as null — unknown — rather than as the worst possible read. Consumers
     * treat null as unknown, never as good.
     */
    "confidence" to line.confidence.takeIf { it > 0f },
    "frame" to box?.let {
      mapOf("left" to it.left, "top" to it.top, "width" to it.width(), "height" to it.height())
    },
    /**
     * Clockwise from top left, per ML Kit, and not necessarily a rectangle:
     * on a curved or tilted label these are what show the line's slope, which
     * the axis-aligned frame cannot. That slope is how the ordering code keeps
     * both halves of one printed line on the same row.
     */
    "corners" to line.cornerPoints?.map { point -> mapOf("x" to point.x, "y" to point.y) },
  )
}
