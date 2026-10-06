package expo.modules.textweight

import android.content.res.Configuration
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android's "Bold text" setting, which React Native does not apply.
 *
 * Android 12 and later add `Configuration.fontWeightAdjustment` (300 when Bold
 * text is on) to the weight of a TextView's typeface, in `TextView.setTypeface`.
 * React Native draws each run of text in a typeface of exactly the weight its
 * style names, so the setting never reaches it. JavaScript reads the amount
 * here and adds it itself (`src/constants/typeface.ts`).
 */
class TextWeightModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TextWeight")

    /**
     * How much Bold text adds to every weight now: 300 when it is on, 0 when it
     * is off, below Android 12 (which has no such setting), or when Android
     * does not say.
     */
    Function("fontWeightAdjustment") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function 0
      // The activity's configuration first: it is the one updated when the
      // setting changes while the app runs.
      val configuration = appContext.currentActivity?.resources?.configuration
        ?: appContext.reactContext?.resources?.configuration
        ?: return@Function 0
      val adjustment = configuration.fontWeightAdjustment
      if (adjustment == Configuration.FONT_WEIGHT_ADJUSTMENT_UNDEFINED) 0 else adjustment
    }
  }
}
