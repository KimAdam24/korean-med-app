import ExpoModulesCore
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

      let handler = VNImageRequestHandler(url: url, options: [:])
      do {
        try handler.perform([request])
      } catch {
        throw RecognitionFailedException(error.localizedDescription)
      }

      guard let observations = request.results else { return [] }

      /**
       * Vision does not promise reading order, and ML Kit on Android groups
       * differently again. Both platforms sort into top-to-bottom,
       * left-to-right here so that everything above this boundary sees one
       * consistent shape — the sig parser must not have to know which engine
       * produced its input.
       *
       * Vision's `boundingBox` is normalised with its origin at the bottom
       * left, so a *larger* y is higher up the label. Hence descending.
       */
      let ordered = observations.sorted { lhs, rhs in
        let dy = lhs.boundingBox.midY - rhs.boundingBox.midY
        if abs(dy) > 0.01 {
          return dy > 0
        }
        return lhs.boundingBox.minX < rhs.boundingBox.minX
      }

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
