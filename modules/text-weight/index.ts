import { requireOptionalNativeModule } from 'expo';

/**
 * Android's "Bold text" setting: how much it adds to every font weight. See
 * `android/.../TextWeightModule.kt`.
 *
 * `null` on iOS, where `AccessibilityInfo.isBoldTextEnabled` answers instead,
 * and on an Android build made before this module existed, where the app draws
 * text at its own weights, as it did before.
 */
type TextWeightModule = {
  fontWeightAdjustment(): number;
};

export const TextWeight = requireOptionalNativeModule<TextWeightModule>('TextWeight');
