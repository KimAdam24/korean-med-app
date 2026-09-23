import ExpoModulesCore
import ImageIO
import Vision

/**
 * On-device text recognition for medication labels (spec §3.1, OCR fallback).
 *
 * Uses Apple's Vision framework, which is part of the OS: no third-party
 * dependency, nothing added to the bundle, and the image never leaves the
 * device. That last point is the whole reason this module exists rather than a
 * cloud OCR call — spec §4 does not allow the photograph to be transmitted.
 */

/// The URI did not point at a readable image file.
internal final class ImageUnreadableException: GenericException<String> {
  override var reason: String {
    "The image at \(param) could not be read. It may already have been deleted."
  }
}

/// Vision itself failed to run the request.
internal final class RecognitionFailedException: GenericException<String> {
  override var reason: String {
    "Text recognition failed: \(param)"
  }
}

public class LabelOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LabelOcr")

    /**
     * Reads Latin text from the image at `uri`.
     *
     * Runs on a background thread (the Expo Modules default for
     * `AsyncFunction`), which matters because accurate-level recognition on a
     * full-resolution photo is slow enough to drop frames if it ran on main.
     *
     * The caller passes a URI whose file exists only for the duration of the
     * surrounding `withTransientCapture` window, so this must not defer work
     * past its own return.
     */
    AsyncFunction("recognizeTextAsync") { (uri: String) -> [[String: Any?]] in
      guard let url = URL(string: uri), url.isFileURL,
            FileManager.default.fileExists(atPath: url.path) else {
        throw ImageUnreadableException(uri)
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate

      /**
       * Language correction is deliberately **off**.
       *
       * It improves ordinary prose, and a pharmacy label is not ordinary prose.
       * Correction works from a lexicon that does not contain drug names, so
       * its failure mode is silently rewriting an unfamiliar name into a
       * familiar word — turning a misread into a confident, plausible, wrong
       * medication name. Raw characters that look odd can be flagged for the
       * user to confirm; a tidily autocorrected wrong name cannot.
       *
       * Once §3.2 gives us an ingredient list, `request.customWords` is the
       * right way to get the accuracy back without the risk.
       */
      request.usesLanguageCorrection = false
      request.recognitionLanguages = ["en-US"]

      /**
       * Orientation is passed explicitly, and must be.
       *
       * `VNImageRequestHandler(url:options:)` does not apply the EXIF
       * orientation tag — it reads the stored pixels as they lie. That was
       * harmless while every image came from our own camera, where we control
       * the capture. A photograph chosen from the user's library is arbitrary:
       * a portrait shot is very often stored landscape with a tag saying which
       * way is up, and handed to Vision unrotated it is a page of sideways
       * text, which recognises as nothing at all.
       *
       * The failure is silent and looks like the engine is broken rather than
       * mis-fed, which is why this is read here rather than left to be
       * discovered.
       */
      let orientation = exifOrientation(of: url)
      let handler = VNImageRequestHandler(url: url, orientation: orientation, options: [:])
      do {
        try handler.perform([request])
      } catch {
        throw RecognitionFailedException(error.localizedDescription)
      }

      guard let observations = request.results else { return [] }

      /**
       * In the order Vision returned them, with each line's geometry.
       *
       * This module used to sort observations into reading order itself. That
       * moved to TypeScript (`src/features/ocr/reading-order.ts`): ordering is
       * a heuristic that has to be tuned against real labels — curved vials
       * above all — and only there can it be tested against geometry recorded
       * from them. Native code now reports what the engine saw and decides
       * nothing.
       */
      let size = orientedPixelSize(of: url, orientation: orientation)

      return observations.compactMap { observation -> [String: Any?]? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return nil }
        return [
          "text": text,
          // 0...1. Not comparable with ML Kit's scale, so any threshold on it
          // has to be calibrated per platform.
          "confidence": candidate.confidence,
          "frame": frame(of: observation.boundingBox, in: size),
          /**
           * Clockwise from top left, matching ML Kit's order. Not necessarily
           * a rectangle: on a curved or tilted label these show the line's
           * slope, which the axis-aligned frame cannot, and that slope is how
           * the ordering code keeps both halves of one printed line together.
           */
          "corners": [
            observation.topLeft,
            observation.topRight,
            observation.bottomRight,
            observation.bottomLeft,
          ].map { pixels(of: $0, in: size) },
        ]
      }
    }
  }
}

/**
 * Width and height of the image as Vision sees it — after orientation is
 * applied, so a portrait photo stored landscape reports portrait dimensions.
 * Vision's normalised coordinates are relative to that oriented image.
 *
 * Falls back to 1×1, which leaves coordinates in Vision's normalised units,
 * when the file does not state its size. Ordering only ever compares positions
 * within one image, so normalised coordinates order correctly; they are just
 * not pixels.
 */
private func orientedPixelSize(of url: URL, orientation: CGImagePropertyOrientation) -> CGSize {
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
        let width = properties[kCGImagePropertyPixelWidth] as? Int,
        let height = properties[kCGImagePropertyPixelHeight] as? Int else {
    return CGSize(width: 1, height: 1)
  }

  switch orientation {
  case .left, .leftMirrored, .right, .rightMirrored:
    // Stored rotated a quarter turn: the displayed image is the other way up.
    return CGSize(width: height, height: width)
  default:
    return CGSize(width: width, height: height)
  }
}

/// A Vision point — normalised, origin bottom left — as pixels from the top left.
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

/**
 * The EXIF orientation of the image at `url`, or `.up` when it has none.
 *
 * `.up` is the right default rather than a guess: an image with no orientation
 * tag is by definition stored the way it should be displayed, so treating it
 * as upright is correct rather than merely safe.
 */
private func exifOrientation(of url: URL) -> CGImagePropertyOrientation {
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
        let raw = properties[kCGImagePropertyOrientation] as? UInt32,
        let orientation = CGImagePropertyOrientation(rawValue: raw) else {
    return .up
  }
  return orientation
}
