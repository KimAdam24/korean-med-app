package expo.modules.labelsweep

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import android.util.Size
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.view.PreviewView
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import expo.modules.labelocr.describeLine
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

/**
 * A viewfinder that reads the label from the camera's analysis stream.
 *
 * ## Why not photographs
 *
 * A photograph is a shutter event, and on phones sold in Korea the shutter
 * sound cannot be switched off; a sweep of repeated photos would click several
 * times a second. The analysis stream — the frames the camera delivers for
 * live processing, as expo-camera's barcode scanner uses — is silent on every
 * phone. See docs/sweep-privacy.md.
 *
 * ## The invariant, as this class keeps it
 *
 * - Frames never leave this class. Recognition runs here, and the only event
 *   sent to JavaScript carries lines of text and their geometry.
 * - At most one frame is held: CameraX's keep-only-latest backpressure drops
 *   frames the analyser is too busy for, and a frame arriving while another
 *   is being read, or sooner than [MIN_INTERVAL_MS] after the last, is closed
 *   unread at once.
 * - A frame being read is closed in the recogniser's completion listener,
 *   which runs whether recognition succeeded or failed — before the next frame
 *   is taken.
 * - Nothing is written anywhere.
 *
 * ## Development replay
 *
 * With `replay` set, in a debuggable build only, frames come from files
 * instead of the camera (see [SweepReplay]) and go through the same [read].
 * The camera is not opened at all.
 */
@SuppressLint("ViewConstructor")
class LabelSweepView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onLines by EventDispatcher<Map<String, Any?>>()
  private val onSweepError by EventDispatcher<Map<String, Any?>>()

  private val previewView = PreviewView(context).apply {
    // A TextureView, so the overlays JavaScript draws on top stay on top.
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }

  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  // For binding the camera: `awaitInstance`, as expo-camera does, rather than
  // the ListenableFuture API, whose Guava type this module does not carry.
  private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
  private val reading = AtomicBoolean(false)
  @Volatile private var lastReadAt = 0L

  private var provider: ProcessCameraProvider? = null
  private var preview: Preview? = null
  private var analysis: ImageAnalysis? = null
  private var camera: Camera? = null
  private var active = false
  private var torch = false
  private var released = false

  /** The props as last set; [applyProps] acts on them once all have arrived. */
  private var wantActive = false
  private var wantReplay: String? = null
  private var replaying: String? = null
  private var replayJob: Job? = null

  // Development replay only: the frame being read, and which one it is.
  private val replayImage = ImageView(context).apply {
    scaleType = ImageView.ScaleType.FIT_CENTER
    setBackgroundColor(Color.BLACK)
    visibility = GONE
  }
  private val replayLabel = TextView(context).apply {
    setTextColor(Color.YELLOW)
    setBackgroundColor(Color.argb(160, 0, 0, 0))
    textSize = 14f
    gravity = Gravity.CENTER
    setPadding(16, 8, 16, 8)
    visibility = GONE
  }
  private var shown: Bitmap? = null

  init {
    addView(previewView)
    addView(replayImage)
    addView(replayLabel)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    measureChild(previewView, widthMeasureSpec, heightMeasureSpec)
    measureChild(replayImage, widthMeasureSpec, heightMeasureSpec)
    measureChild(replayLabel, widthMeasureSpec, heightMeasureSpec)
    setMeasuredDimension(
      resolveSize(previewView.measuredWidth, widthMeasureSpec),
      resolveSize(previewView.measuredHeight, heightMeasureSpec)
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val width = right - left
    val height = bottom - top
    previewView.layout(0, 0, width, height)
    replayImage.layout(0, 0, width, height)
    // Across the middle, clear of the banner and controls JavaScript draws.
    val labelHeight = replayLabel.measuredHeight
    replayLabel.layout(0, height / 2 - labelHeight / 2, width, height / 2 + labelHeight / 2)
  }

  fun setActive(next: Boolean) {
    wantActive = next
  }

  /** DEVELOPMENT ONLY: read frames from this replay instead of the camera. */
  fun setReplay(next: String?) {
    wantReplay = next?.takeIf { it.isNotBlank() }
  }

  /**
   * Called once each batch of props has been set, so a replay named in the
   * same update as `active` is seen before the camera would have been opened.
   */
  fun applyProps() {
    if (released) return
    val source = if (wantActive) wantReplay ?: CAMERA else null
    val running = if (active) replaying ?: CAMERA else null
    if (source == running) return

    if (active) stop()
    active = wantActive
    if (!active) return
    if (wantReplay != null) startReplay(wantReplay!!) else start()
  }

  fun setTorch(next: Boolean) {
    torch = next
    camera?.cameraControl?.enableTorch(next)
  }

  /** The view is going away: the camera, the recogniser and the thread go with it. */
  fun release() {
    if (released) return
    released = true
    stop()
    scope.cancel()
    recognizer.close()
    analysisExecutor.shutdown()
  }

  private fun start() {
    if (released) return
    val activity = appContext.currentActivity as? AppCompatActivity
    if (activity == null) {
      onSweepError(mapOf("message" to "no-activity"))
      return
    }

    scope.launch {
      try {
        val cameraProvider = ProcessCameraProvider.awaitInstance(context)
        if (!active || released) return@launch
        provider = cameraProvider

        val nextPreview = Preview.Builder().build().also {
          it.surfaceProvider = previewView.surfaceProvider
        }
        val nextAnalysis = ImageAnalysis.Builder()
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          // Enough for label text at arm's length; more would only slow each
          // read and widen the gap between frames.
          .setResolutionSelector(
            ResolutionSelector.Builder()
              .setResolutionStrategy(
                ResolutionStrategy(
                  Size(1920, 1080),
                  ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER
                )
              )
              .build()
          )
          .build()
          .also { it.setAnalyzer(analysisExecutor, ::analyse) }

        // Only this view's own use cases: the capture screen's other camera
        // is never running at the same time, and is not ours to unbind.
        preview?.let { cameraProvider.unbind(it) }
        analysis?.let { cameraProvider.unbind(it) }
        camera = cameraProvider.bindToLifecycle(
          activity,
          CameraSelector.DEFAULT_BACK_CAMERA,
          nextPreview,
          nextAnalysis
        )
        preview = nextPreview
        analysis = nextAnalysis
        camera?.cameraControl?.enableTorch(torch)
      } catch (e: Exception) {
        onSweepError(mapOf("message" to (e.message ?: "camera-unavailable")))
      }
    }
  }

  private fun stop() {
    stopReplay()
    analysis?.clearAnalyzer()
    val cameraProvider = provider ?: return
    preview?.let { cameraProvider.unbind(it) }
    analysis?.let { cameraProvider.unbind(it) }
    preview = null
    analysis = null
    camera = null
  }

  /**
   * One frame. Closed unread unless the analyser is free and enough time has
   * passed; otherwise read, and closed when the read completes either way.
   */
  @SuppressLint("UnsafeOptInUsageError")
  private fun analyse(frame: ImageProxy) {
    val now = SystemClock.elapsedRealtime()
    val media = frame.image
    if (media == null || now - lastReadAt < MIN_INTERVAL_MS || !reading.compareAndSet(false, true)) {
      frame.close()
      return
    }
    lastReadAt = now

    val rotation = frame.imageInfo.rotationDegrees
    // ML Kit reports coordinates in the image turned upright.
    val upright = rotation == 90 || rotation == 270
    val width = if (upright) frame.height else frame.width
    val height = if (upright) frame.width else frame.height

    val input = try {
      InputImage.fromMediaImage(media, rotation)
    } catch (e: Exception) {
      frame.close()
      reading.set(false)
      return
    }

    read(input, width, height, SOURCE_CAMERA) {
      // Success or failure: the frame goes before the next is taken.
      frame.close()
      reading.set(false)
    }
  }

  /**
   * Reads one frame and sends its lines, and only its lines, to JavaScript.
   * The one path every frame takes, from the camera or a replay. [done] runs
   * when the read is over, whether it succeeded or not.
   *
   * [source] says which, and is decided here, by the code that produced the
   * frame, not by anything JavaScript sets: a development replay may keep
   * its frames for debugging, and only frames marked as a replay's can be
   * kept (see `replay-log.ts`).
   */
  private fun read(input: InputImage, width: Int, height: Int, source: String, done: () -> Unit) {
    recognizer.process(input)
      .addOnSuccessListener { text ->
        val lines = text.textBlocks.flatMap { block -> block.lines }.mapNotNull { line -> describeLine(line) }
        post {
          if (active && !released) {
            onLines(mapOf("lines" to lines, "width" to width, "height" to height, "source" to source))
          }
        }
      }
      .addOnCompleteListener { done() }
  }

  // --- Development replay -------------------------------------------------

  private fun startReplay(name: String) {
    val opened = SweepReplay.open(context, name)
    val replay = opened.getOrElse { error ->
      Log.w(TAG, "Replay not started: ${error.message}")
      onSweepError(mapOf("message" to (error.message ?: "replay-unavailable")))
      return
    }
    replaying = name
    previewView.visibility = GONE
    replayImage.visibility = VISIBLE
    replayLabel.visibility = VISIBLE
    Log.i(TAG, "Replaying $name: ${replay.count} frame(s)")

    replayJob = scope.launch {
      try {
        for (index in 0 until replay.count) {
          if (!isActive || !active) break
          val startedAt = SystemClock.elapsedRealtime()
          val frame = withContext(Dispatchers.IO) { replay.frame(index) }
          if (frame == null) {
            Log.w(TAG, "Replay $name: frame ${index + 1} could not be decoded; skipped")
            continue
          }
          show(frame.bitmap, "REPLAY (development)  $name  ${index + 1} / ${replay.count}")

          val upright = frame.rotationDegrees == 90 || frame.rotationDegrees == 270
          val width = if (upright) frame.bitmap.height else frame.bitmap.width
          val height = if (upright) frame.bitmap.width else frame.bitmap.height
          val input = InputImage.fromBitmap(frame.bitmap, frame.rotationDegrees)
          suspendCancellableCoroutine { resumed ->
            read(input, width, height, SOURCE_REPLAY) { if (resumed.isActive) resumed.resume(Unit) }
          }
          // The camera's cadence: no sooner than it would read the next frame.
          delay((MIN_INTERVAL_MS - (SystemClock.elapsedRealtime() - startedAt)).coerceAtLeast(0))
        }
        replayLabel.text = "REPLAY (development)  $name  finished"
        Log.i(TAG, "Replay $name finished")
      } finally {
        replay.close()
      }
    }
  }

  private fun stopReplay() {
    replayJob?.cancel()
    replayJob = null
    replaying = null
    // Let go, not recycled: a read cancelled mid-way may still hold it.
    replayImage.setImageDrawable(null)
    shown = null
    replayImage.visibility = GONE
    replayLabel.visibility = GONE
    previewView.visibility = VISIBLE
  }

  /** Puts [bitmap] on screen, and lets go of the one before, which has been read. */
  private fun show(bitmap: Bitmap, label: String) {
    replayImage.setImageBitmap(bitmap)
    shown?.recycle()
    shown = bitmap
    replayLabel.text = label
  }

  companion object {
    /** About three reads a second: plenty for a bottle turned by hand. */
    const val MIN_INTERVAL_MS = 300L

    private const val TAG = "LabelSweep"
    private const val CAMERA = "camera"

    /** Where a frame came from, as sent with its lines. */
    private const val SOURCE_CAMERA = "camera"
    private const val SOURCE_REPLAY = "replay"
  }
}
