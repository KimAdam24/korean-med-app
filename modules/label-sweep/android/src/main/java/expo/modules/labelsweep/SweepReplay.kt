package expo.modules.labelsweep

import android.content.Context
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * DEVELOPMENT ONLY: frames for the sweep from files instead of the camera, so
 * the sweep can be driven where there is no working camera (an emulator).
 *
 * Each frame goes through exactly what a camera frame goes through after the
 * camera — the same recogniser, the same line mapping, the same event, the
 * same merge in JavaScript — at the camera's cadence and about the camera's
 * analysis size. What it cannot stand in for is the camera itself: binding,
 * focus, exposure, frame rotation from the sensor, and how many frames a real
 * phone drops while it reads one.
 *
 * ## Where frames come from
 *
 * Only this app's own `sweep-replay` folder, on external storage:
 * `/sdcard/Android/data/<package>/files/sweep-replay/<name>`, which `adb push`
 * can write and the app can read without a storage permission. `<name>` is
 * either a folder of images, read in name order, or one video, sampled every
 * [LabelSweepView.MIN_INTERVAL_MS]. Nothing is ever written.
 *
 * ## Why it cannot run in a release build
 *
 * [available] is false unless the app is debuggable, and JavaScript passes a
 * replay only in development. The files are test material a developer put
 * there; on a user's phone the folder does not exist.
 */
internal class SweepReplay private constructor(
  private val images: List<File>?,
  private val video: File?,
) {
  /** Frame times, or image indexes: what [frame] takes. */
  val count: Int
  private val retriever: MediaMetadataRetriever?
  private val videoRotation: Int
  private val videoSize: Pair<Int, Int>?

  init {
    if (video != null) {
      val source = MediaMetadataRetriever().apply { setDataSource(video.absolutePath) }
      val durationMs =
        source.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
      retriever = source
      count = (durationMs / LabelSweepView.MIN_INTERVAL_MS).toInt() + 1
      videoRotation =
        source.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      val width = source.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
      val height = source.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
      videoSize = if (width != null && height != null) width to height else null
    } else {
      retriever = null
      count = images?.size ?: 0
      videoRotation = 0
      videoSize = null
    }
  }

  /** One decoded frame, and how far it must be turned to be upright. */
  class Frame(val bitmap: Bitmap, val rotationDegrees: Int)

  /** Frame [index], or null if it cannot be decoded (it is skipped). */
  fun frame(index: Int): Frame? =
    try {
      if (retriever != null) videoFrame(index) else imageFrame(images!![index])
    } catch (e: Exception) {
      null
    }

  fun close() {
    retriever?.release()
  }

  private fun videoFrame(index: Int): Frame? {
    val source = retriever ?: return null
    val atUs = index * LabelSweepView.MIN_INTERVAL_MS * 1000
    val raw = source.getFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST) ?: return null
    // Whether the retriever has already turned the frame upright differs by
    // Android version; its shape says which. Still in the recorded shape, it
    // needs the recorded rotation; already turned, none.
    val turned = videoSize?.let { (width, height) ->
      (videoRotation == 90 || videoRotation == 270) && (raw.width > raw.height) != (width > height)
    } ?: false
    return Frame(scaled(raw), if (turned) 0 else videoRotation)
  }

  private fun imageFrame(file: File): Frame? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= LONG_SIDE) sample *= 2
    val raw = BitmapFactory.decodeFile(
      file.absolutePath,
      BitmapFactory.Options().apply { inSampleSize = sample }
    ) ?: return null
    // A phone photo stores its orientation in EXIF rather than in its pixels.
    val rotation = when (
      ExifInterface(file.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    ) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90
      ExifInterface.ORIENTATION_ROTATE_180 -> 180
      ExifInterface.ORIENTATION_ROTATE_270 -> 270
      else -> 0
    }
    return Frame(scaled(raw), rotation)
  }

  /** About the camera's analysis size, so text is read at the size a live frame gives. */
  private fun scaled(raw: Bitmap): Bitmap {
    val long = max(raw.width, raw.height)
    if (long <= LONG_SIDE) return raw
    val factor = LONG_SIDE.toFloat() / long
    val result = Bitmap.createScaledBitmap(
      raw,
      (raw.width * factor).roundToInt(),
      (raw.height * factor).roundToInt(),
      true
    )
    if (result !== raw) raw.recycle()
    return result
  }

  companion object {
    /** The long side of the camera's analysis frames (1920 x 1080). */
    private const val LONG_SIDE = 1920

    private val NAME = Regex("^[A-Za-z0-9._-]{1,80}$")
    private val IMAGE = Regex("(?i).*\\.(jpe?g|png|webp)$")
    private val VIDEO = Regex("(?i).*\\.(mp4|m4v|mov|3gp|mkv|webm)$")

    /** Only in a debuggable build. */
    fun available(context: Context): Boolean =
      (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    fun folder(context: Context): File? = context.getExternalFilesDir("sweep-replay")

    /**
     * The replay named [name] in this app's replay folder, or an error saying
     * why not. A bare name only: no path can reach outside the folder.
     */
    fun open(context: Context, name: String): Result<SweepReplay> {
      if (!available(context)) return Result.failure(IllegalStateException("replay-not-in-release"))
      if (!NAME.matches(name) || name.startsWith(".")) {
        return Result.failure(IllegalArgumentException("replay-bad-name: $name"))
      }
      val root = folder(context) ?: return Result.failure(IllegalStateException("replay-no-storage"))
      val source = File(root, name)
      if (source.canonicalFile.parentFile != root.canonicalFile) {
        return Result.failure(IllegalArgumentException("replay-bad-name: $name"))
      }
      return try {
        when {
          source.isDirectory -> {
            val images = source.listFiles { file -> file.isFile && IMAGE.matches(file.name) }
              ?.sortedBy { it.name }
              .orEmpty()
            if (images.isEmpty()) Result.failure(IllegalStateException("replay-empty: $source"))
            else Result.success(SweepReplay(images, null))
          }
          source.isFile && VIDEO.matches(source.name) -> Result.success(SweepReplay(null, source))
          else -> Result.failure(IllegalStateException("replay-not-found: $source"))
        }
      } catch (e: Exception) {
        Result.failure(IllegalStateException("replay-unreadable: ${e.message}"))
      }
    }
  }
}
