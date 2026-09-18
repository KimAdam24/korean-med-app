import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import { hasPin, verifyPin, type PinVerification } from './pin';

/**
 * The lock in front of the medication profile (spec §3.3).
 *
 * ## Which gate is used, and why
 *
 * `authenticateAsync` is called with `disableDeviceFallback: false`, so the OS
 * itself offers the device passcode after biometrics fail. That *is* the "PIN
 * fallback" the spec asks for, and it is the better one: the device passcode is
 * checked by the secure enclave, is rate-limited by the platform, and means
 * this app stores no PIN material at all.
 *
 * Our own PIN (`pin.ts`) is therefore the second fallback, not the first. It is
 * required only when the device offers nothing — `SecurityLevel.NONE`, meaning
 * no biometrics *and* no screen lock — and is otherwise an optional escape
 * hatch for the case that actually strands people: biometrics that stop working
 * (a cut fingertip, a re-enrolled face, a hardware lockout) on a phone whose
 * owner cannot reliably recall a long passcode. Being unable to reach your own
 * medication list is a safety problem, not just an inconvenience.
 *
 * ## Web
 *
 * There is no keychain and no local authentication on web. Rather than present
 * a lock that does not lock, `probeLockCapability` reports `unsupported` and
 * the UI declines to hold medication data on that platform at all.
 */

export type LockCapability = {
  /** True when biometric hardware exists *and* the user has enrolled. */
  readonly biometricsReady: boolean;
  /** Which prompt to name in the UI: Face ID reads differently from a fingerprint. */
  readonly biometricKind: 'face' | 'fingerprint' | 'iris' | 'none';
  /** The device has some secure lock (biometric or passcode) the OS can enforce. */
  readonly deviceSecured: boolean;
  /** An app PIN has been set. */
  readonly pinSet: boolean;
  /**
   * No OS gate is available, so an app PIN is the only thing that can protect
   * the profile. The UI must insist on one being created before anything is saved.
   */
  readonly pinRequired: boolean;
  /** No secure storage or authentication on this platform at all. */
  readonly unsupported: boolean;
};

export async function probeLockCapability(): Promise<LockCapability> {
  if (Platform.OS === 'web') {
    return {
      biometricsReady: false,
      biometricKind: 'none',
      deviceSecured: false,
      pinSet: false,
      pinRequired: false,
      unsupported: true,
    };
  }

  const [hasHardware, enrolled, level, types, pinSet] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
    hasPin(),
  ]);

  const deviceSecured = level !== LocalAuthentication.SecurityLevel.NONE;

  return {
    biometricsReady: hasHardware && enrolled,
    biometricKind: describeBiometric(types),
    deviceSecured,
    pinSet,
    pinRequired: !deviceSecured,
    unsupported: false,
  };
}

function describeBiometric(
  types: LocalAuthentication.AuthenticationType[]
): LockCapability['biometricKind'] {
  // Ordered by how the prompt will actually present itself when a device
  // supports more than one.
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
  return 'none';
}

export type UnlockOutcome =
  | { readonly kind: 'unlocked' }
  /** The user dismissed the prompt. Not a failure; show the lock screen again, quietly. */
  | { readonly kind: 'cancelled' }
  /** Biometrics were presented and rejected. Worth saying so, and worth offering the PIN. */
  | { readonly kind: 'rejected' }
  /**
   * The OS gate cannot be used at all — not enrolled, no passcode, hardware
   * locked out, or unavailable. The app PIN is the way through.
   */
  | { readonly kind: 'unavailable'; readonly reason: 'not-enrolled' | 'locked-out' | 'no-hardware' }
  | { readonly kind: 'failed' };

/**
 * Runs the OS authentication prompt.
 *
 * `promptMessage` is Korean because the system dialog is the one piece of UI
 * this app does not draw itself, and it is the one the user reads first.
 */
export async function unlockWithDevice(promptMessage: string, cancelLabel: string): Promise<UnlockOutcome> {
  if (Platform.OS === 'web') {
    return { kind: 'unavailable', reason: 'no-hardware' };
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel,
    /**
     * Left `false` on purpose: this is what makes the OS offer the device
     * passcode after failed biometrics, which is the stronger fallback and the
     * reason this app does not need to own a PIN on most devices.
     */
    disableDeviceFallback: false,
    /**
     * Android only. `true` would add a "confirm" tap after a successful face
     * match — an extra deliberate step, which suits a user who may otherwise
     * unlock the app by glancing at the phone without meaning to.
     */
    requireConfirmation: true,
  });

  if (result.success) return { kind: 'unlocked' };

  switch (result.error) {
    case 'user_cancel':
    case 'app_cancel':
    case 'system_cancel':
      return { kind: 'cancelled' };

    // Raised when the user picks the fallback while device fallback is
    // disabled. We do not disable it, so reaching here means the OS handed the
    // decision back to us — route it to the app PIN rather than call it a failure.
    case 'user_fallback':
      return { kind: 'unavailable', reason: 'not-enrolled' };

    case 'not_enrolled':
    case 'passcode_not_set':
      return { kind: 'unavailable', reason: 'not-enrolled' };

    case 'not_available':
      return { kind: 'unavailable', reason: 'no-hardware' };

    // Too many biometric attempts. The OS will not try again for a while, so
    // the PIN is the only remaining route in.
    case 'lockout':
      return { kind: 'unavailable', reason: 'locked-out' };

    case 'authentication_failed':
      return { kind: 'rejected' };

    default:
      return { kind: 'failed' };
  }
}

/** Re-exported so the lock screen imports one module rather than two. */
export { verifyPin, type PinVerification };
