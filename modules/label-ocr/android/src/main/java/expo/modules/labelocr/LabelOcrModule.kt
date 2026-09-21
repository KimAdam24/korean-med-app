package expo.modules.labelocr

import android.graphics.Rect
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
         * Flattened out of ML Kit's block grouping and re-ordered. Apple's
         * Vision groups the same label differently, and everything above this
         * boundary is written against one shape — the sig parser must not have
         * to know which engine ran.
         */
        return@Coroutine readingOrder(recognised.textBlocks.flatMap { block -> block.lines })
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

/**
 * Orders lines the way a person reads them: top to bottom, and left to right
 * within a row.
 *
 * Sorting by `top` and then `left` does not achieve this, and was the bug it
 * replaces. Two boxes on one visual row almost never share an exact top pixel,
 * so the secondary comparison never ran and ordering was decided by a pixel or
 * two of noise — which on a multi-column label interleaves the columns.
 *
 * The obvious repair, a comparator that calls near-equal tops equal, is worse
 * than it looks: that relation is not transitive (a may tie b, b tie c, yet a
 * sort strictly before c), so it is not a strict weak ordering. Java's TimSort
 * detects exactly that and throws "Comparison method violates its general
 * contract!". Banding into rows first keeps every comparison a real total
 * order.
 *
 * The band tolerance is half the height of the line that opened the row, so it
 * scales with the text rather than assuming a resolution.
 *
 * Note this orders rows, not columns: a label whose columns share rows will
 * still interleave. Detecting columns is a larger problem, and worth solving
 * only if a real label turns out to need it.
 */
private fun readingOrder(lines: List<Text.Line>): List<Text.Line> {
  val positioned = lines.mapNotNull { line -> line.boundingBox?.let { box -> line to box } }
  // Geometry is nullable. A line without it cannot be placed, but its text is
  // still worth returning, so it goes last rather than being dropped.
  val unpositioned = lines.filter { it.boundingBox == null }

  val rows = mutableListOf<MutableList<Pair<Text.Line, Rect>>>()
  for (entry in positioned.sortedBy { (_, box) -> box.top }) {
    val (_, box) = entry
    val anchor = rows.lastOrNull()?.firstOrNull()?.second
    val tolerance = (anchor?.height() ?: box.height()) / 2

    if (anchor != null && box.top - anchor.top <= tolerance) {
      rows.last().add(entry)
    } else {
      rows.add(mutableListOf(entry))
    }
  }

  return rows.flatMap { row -> row.sortedBy { (_, box) -> box.left }.map { (line, _) -> line } } +
    unpositioned
}
