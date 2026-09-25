// NOT LINKED, NOT COMPILED. Written for review; see ../README.md before
// enabling. Mirrors android/.../LabelSweepModule.kt.
import ExpoModulesCore

public class LabelSweepModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LabelSweep")

    View(LabelSweepView.self) {
      Events("onLines", "onSweepError")

      /// Reading only while true; the camera session stops when false.
      Prop("active") { (view: LabelSweepView, active: Bool) in
        view.setActive(active)
      }

      Prop("torch") { (view: LabelSweepView, torch: Bool) in
        view.setTorch(torch)
      }
    }
  }
}
