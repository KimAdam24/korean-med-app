// NOT LINKED, NOT COMPILED. Written for review; see ../README.md before
// enabling. Mirrors android/.../LabelSweepView.kt, and must keep the same
// invariant (docs/sweep-privacy.md).
import AVFoundation
import ExpoModulesCore
import QuartzCore
import Vision

/**
 * A viewfinder that reads the label from the camera's video frames.
 *
 * Why not photographs: on iPhones sold in Korea (and Japan) iOS plays the
 * shutter sound for every photo capture, and no app can turn it off. Video
 * frames are not photographs, and make no sound anywhere.
 *
 * The invariant, as this class keeps it:
 * - Frames never leave this class. Recognition runs here; the only event sent
 *   to JavaScript carries lines of text and their geometry.
 * - At most one frame is held. The output discards late frames, and a frame
 *   arriving while another is being read, or sooner than `minInterval` after
 *   the last, is returned unread.
 * - A frame is read synchronously inside the delegate callback; AVFoundation
 *   reclaims its buffer when the callback returns, so it is released as soon
 *   as its own recognition completes, success or failure.
 * - Nothing is written anywhere.
 */
final class LabelSweepView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onLines = EventDispatcher()
  let onSweepError = EventDispatcher()

  private let session = AVCaptureSession()
  private let output = AVCaptureVideoDataOutput()
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let sessionQueue = DispatchQueue(label: "label-sweep.session")
  private let analysisQueue = DispatchQueue(label: "label-sweep.analysis")

  /// About three reads a second: plenty for a bottle turned by hand.
  private let minInterval: CFTimeInterval = 0.3

  // Session state: touched on `sessionQueue` only.
  private var configured = false
  private var torch = false

  // Analysis state: touched on `analysisQueue` only.
  private var reading = false
  private var lastReadAt: CFTimeInterval = 0

  // Main thread only.
  private var active = false

  required init(appContext: AppContext? = nil) {
    previewLayer = AVCaptureVideoPreviewLayer(session: session)
    super.init(appContext: appContext)
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
    clipsToBounds = true
  }

  /// Required of a UIView subclass that declares its own initialiser; never
  /// used, since Expo creates views in code.
  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("LabelSweepView is not created from a storyboard.")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
  }

  /// Leaving the window is leaving the screen: the session stops with it.
  override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    if newWindow == nil {
      setActive(false)
    }
  }

  deinit {
    let session = self.session
    sessionQueue.async {
      if session.isRunning {
        session.stopRunning()
      }
    }
  }

  func setActive(_ next: Bool) {
    guard next != active else { return }
    active = next
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if next {
        self.startSession()
      } else if self.session.isRunning {
        self.session.stopRunning()
      }
    }
  }

  func setTorch(_ next: Bool) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.torch = next
      self.applyTorch()
    }
  }

  // MARK: - Session (on sessionQueue)

  private func startSession() {
    if !configured && !configure() {
      return
    }
    if !session.isRunning {
      session.startRunning()
    }
    applyTorch()
  }

  private func configure() -> Bool {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      emitError("camera-not-authorized")
      return false
    }
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
          let input = try? AVCaptureDeviceInput(device: device) else {
      emitError("camera-unavailable")
      return false
    }

    session.beginConfiguration()
    if session.canSetSessionPreset(.hd1920x1080) {
      session.sessionPreset = .hd1920x1080
    }
    if session.canAddInput(input) {
      session.addInput(input)
    }
    output.alwaysDiscardsLateVideoFrames = true
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    ]
    output.setSampleBufferDelegate(self, queue: analysisQueue)
    if session.canAddOutput(output) {
      session.addOutput(output)
    }
    session.commitConfiguration()

    configured = true
    return true
  }

  private func applyTorch() {
    guard let device = (session.inputs.first as? AVCaptureDeviceInput)?.device, device.hasTorch else {
      return
    }
    do {
      try device.lockForConfiguration()
      device.torchMode = torch ? .on : .off
      device.unlockForConfiguration()
    } catch {
      // The torch is a convenience; a failure to switch it is not an error to report.
    }
  }

  private func emitError(_ message: String) {
    DispatchQueue.main.async { [weak self] in
      self?.onSweepError(["message": message])
    }
  }

  // MARK: - Frames (on analysisQueue)

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    let now = CACurrentMediaTime()
    guard !reading, now - lastReadAt >= minInterval,
          let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    reading = true
    lastReadAt = now
    defer { reading = false }

    // Language correction off, as in LabelOcrModule: it rewrites unfamiliar
    // drug names into familiar words.
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]

    // The back camera delivers landscape buffers; with the phone held upright
    // the scene is the buffer turned right.
    let handler = VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .right, options: [:])
    do {
      try handler.perform([request])
    } catch {
      return
    }

    // Upright dimensions: the buffer's, a quarter turn round.
    let width = CVPixelBufferGetHeight(buffer)
    let height = CVPixelBufferGetWidth(buffer)
    let size = CGSize(width: width, height: height)
    let lines: [[String: Any?]] = (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
      if text.isEmpty { return nil }
      return [
        "text": text,
        "confidence": candidate.confidence,
        "frame": frame(of: observation.boundingBox, in: size),
        "corners": [
          observation.topLeft,
          observation.topRight,
          observation.bottomRight,
          observation.bottomLeft,
        ].map { pixels(of: $0, in: size) },
      ]
    }

    DispatchQueue.main.async { [weak self] in
      guard let self, self.active else { return }
      self.onLines(["lines": lines, "width": width, "height": height])
    }
  }
}

/// A Vision point — normalised, origin bottom left — as pixels from the top left.
/// The same as LabelOcrModule's, so both report lines in one shape.
private func pixels(of point: CGPoint, in size: CGSize) -> [String: Double] {
  ["x": Double(point.x * size.width), "y": Double((1 - point.y) * size.height)]
}

/// A Vision box — normalised, origin bottom left — as a pixel frame from the top left.
private func frame(of box: CGRect, in size: CGSize) -> [String: Double] {
  [
    "left": Double(box.minX * size.width),
    "top": Double((1 - box.maxY) * size.height),
    "width": Double(box.width * size.width),
    "height": Double(box.height * size.height),
  ]
}
