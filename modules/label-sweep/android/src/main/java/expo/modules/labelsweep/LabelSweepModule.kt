package expo.modules.labelsweep

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The sweep's camera: a viewfinder that reads the label as the bottle turns.
 * See `LabelSweepView` and docs/sweep-privacy.md.
 */
class LabelSweepModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LabelSweep")

    View(LabelSweepView::class) {
      Events("onLines", "onSweepError")

      /** Reading only while true; the camera is released when false. */
      Prop("active") { view: LabelSweepView, active: Boolean ->
        view.setActive(active)
      }

      Prop("torch") { view: LabelSweepView, torch: Boolean ->
        view.setTorch(torch)
      }

      OnViewDestroys { view: LabelSweepView ->
        view.release()
      }
    }
  }
}
