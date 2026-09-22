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
      let handler = VNImageRequestHandler(
        url: url,
        orientation: exifOrientation(of: url),
        options: [:]
      )
      do {
        try handler.perform([request])
      } catch {
        throw RecognitionFailedException(error.localizedDescription)
      }

      guard let observations = request.results else { return [] }

      /**
       * Vision does not promise reading order, and ML Kit on Android groups
       * differently again. Both platforms order top-to-bottom and then
       * left-to-right here, so that everything above this boundary sees one
       * consistent shape — the sig parser must not have to know which engine
       * produced its input.
       */
      let ordered = readingOrder(observations)

      return ordered.compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return nil }
        return [
          "text": text,
          // 0...1. Android has no per-line equivalent and sends null, so
          // consumers must treat this as optional rather than assume a number.
          "confidence": candidate.confidence,
        ]
      }
    }
  }
}

/**
 * Orders observations the way a person reads them: top to bottom, and left to
 * right within a row.
 *
 * This replaces a comparator that treated near-equal vertical positions as
 * equal and fell through to x. That relation is not transitive — a may tie b,
 * and b tie c, while a and c differ by more than the tolerance — so it is not a
 * strict weak ordering, and `sorted(by:)` given one has undefined behaviour.
 * Banding into rows first keeps every comparison a real total order.
 *
 * Vision's `boundingBox` is normalised with its origin at the bottom left, so a
 * *larger* midY is higher up the label: rows descend. The band tolerance is
 * half the height of the line that opened the row, so it scales with the text
 * rather than assuming a fixed fraction of the image.
 *
 * Note this orders rows, not columns: a label whose columns share rows will
 * still interleave. Detecting columns is a larger problem, worth solving only
 * if a real label turns out to need it.
 */
private func readingOrder(
  _ observations: [VNRecognizedTextObservation]
) -> [VNRecognizedTextObservation] {
  let topDown = observations.sorted { $0.boundingBox.midY > $1.boundingBox.midY }

  var rows: [[VNRecognizedTextObservation]] = []
  for observation in topDown {
    let box = observation.boundingBox
    guard let anchor = rows.last?.first?.boundingBox else {
      rows.append([observation])
      continue
    }

    let tolerance = max(anchor.height, box.height) / 2
    if anchor.midY - box.midY <= tolerance {
      rows[rows.count - 1].append(observation)
    } else {
      rows.append([observation])
    }
  }

  return rows.flatMap { row in
    row.sorted { $0.boundingBox.minX < $1.boundingBox.minX }
  }
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
