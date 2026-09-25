package expo.modules.labelsweep

import android.annotation.SuppressLint
import android.content.Context
import android.os.SystemClock
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

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

  init {
    addView(previewView)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    measureChild(previewView, widthMeasureSpec, heightMeasureSpec)
    setMeasuredDimension(
      resolveSize(previewView.measuredWidth, widthMeasureSpec),
      resolveSize(previewView.measuredHeight, heightMeasureSpec)
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    previewView.layout(0, 0, right - left, bottom - top)
  }

  fun setActive(next: Boolean) {
    if (next == active) return
    active = next
    if (active) start() else stop()
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

    recognizer.process(input)
      .addOnSuccessListener { text ->
        val lines = text.textBlocks.flatMap { block -> block.lines }.mapNotNull { line -> describeLine(line) }
        post {
          if (active && !released) {
            onLines(mapOf("lines" to lines, "width" to width, "height" to height))
          }
        }
      }
      .addOnCompleteListener {
        // Success or failure: the frame goes before the next is taken.
        frame.close()
        reading.set(false)
      }
  }

  companion object {
    /** About three reads a second: plenty for a bottle turned by hand. */
    const val MIN_INTERVAL_MS = 300L
  }
}
