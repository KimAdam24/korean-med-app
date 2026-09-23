/**
 * expo-local-authentication, controllable.
 *
 * A test describes the phone — whether it has a lock, what biometric it
 * offers — and what the next prompt will answer. `hangNextPrompt` reproduces
 * the Android behaviour the lock screen has to survive: a prompt started as
 * the app goes to the background never answers at all.
 */
export enum SecurityLevel {
  NONE = 0,
  SECRET = 1,
  BIOMETRIC_WEAK = 2,
  BIOMETRIC_STRONG = 3,
}

export enum AuthenticationType {
  FINGERPRINT = 1,
  FACIAL_RECOGNITION = 2,
  IRIS = 3,
}

type Result = { success: true } | { success: false; error: string };

const state = {
  hasHardware: true,
  enrolled: true,
  level: SecurityLevel.BIOMETRIC_STRONG as SecurityLevel,
  types: [AuthenticationType.FINGERPRINT] as AuthenticationType[],
  result: { success: true } as Result,
  hang: false,
  prompts: 0,
  cancels: 0,
  /** Answers the prompt that is hanging, if there is one. */
  pending: null as null | ((result: Result) => void),
};

export async function hasHardwareAsync(): Promise<boolean> {
  return state.hasHardware;
}

export async function isEnrolledAsync(): Promise<boolean> {
  return state.enrolled;
}

export async function getEnrolledLevelAsync(): Promise<SecurityLevel> {
  return state.level;
}

export async function supportedAuthenticationTypesAsync(): Promise<AuthenticationType[]> {
  return state.types;
}

export async function authenticateAsync(): Promise<Result> {
  state.prompts += 1;
  if (state.hang) {
    state.hang = false;
    return new Promise<Result>((resolve) => {
      state.pending = resolve;
    });
  }
  return state.result;
}

/** As on Android: a cancelled prompt answers, with `app_cancel`. */
export async function cancelAuthenticate(): Promise<void> {
  state.cancels += 1;
  state.pending?.({ success: false, error: 'app_cancel' });
  state.pending = null;
}

export const biometrics = {
  state,
  /** A phone with its own lock and a fingerprint enrolled. */
  securedPhone(): void {
    Object.assign(state, {
      hasHardware: true,
      enrolled: true,
      level: SecurityLevel.BIOMETRIC_STRONG,
      types: [AuthenticationType.FINGERPRINT],
    });
  },
  /** A phone with no lock at all: the app must carry its own PIN. */
  unsecuredPhone(): void {
    Object.assign(state, { hasHardware: false, enrolled: false, level: SecurityLevel.NONE, types: [] });
  },
  nextPrompt(result: Result): void {
    state.result = result;
  },
  hangNextPrompt(): void {
    state.hang = true;
  },
  reset(): void {
    this.securedPhone();
    Object.assign(state, {
      result: { success: true },
      hang: false,
      prompts: 0,
      cancels: 0,
      pending: null,
    });
  },
};
