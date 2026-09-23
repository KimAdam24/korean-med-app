import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, getRandomBytesAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { KEYCHAIN_SERVICE } from './vault-key';

/**
 * The app PIN: the fallback half of spec §3.3's "biometric with PIN fallback".
 *
 * ## What the PIN is and is not
 *
 * It is an access gate. It is **not** key material. The vault's AES key is
 * generated independently and lives in the hardware-backed keychain; no part of
 * it is derived from the PIN, and knowing the PIN does not help anyone decrypt
 * the medication file. That is a deliberate split, and it decides everything
 * below.
 *
 * If the PIN *were* wrapping the key, a six-digit secret would be a genuine
 * cryptographic weakness and would demand a real memory-hard KDF. expo-crypto
 * offers no PBKDF2, scrypt or Argon2 (only digests, random bytes and AES-GCM),
 * so we would have to hand-roll one — which is how people end up with something
 * that looks expensive and is not.
 *
 * Because the PIN only gates the UI, the verifier's job is narrower: make an
 * attacker who has already dumped the keychain do measurable work, and make an
 * attacker holding the unlocked phone run out of patience. The first is what
 * the salt and iteration count are for; the second, which is the realistic
 * threat, is what the lockout schedule is for.
 *
 * ## Known limit
 *
 * The lockout clock reads `Date.now()`, so someone who can move the device
 * clock backwards can shorten a lockout. Left as-is knowingly: defeating it
 * requires possession of an unlocked phone, at which point the PIN is not what
 * stands between them and the data — the keychain is.
 */

const PIN_ITEM = 'kma.lock.pin.v1';
const ATTEMPTS_ITEM = 'kma.lock.attempts.v1';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: KEYCHAIN_SERVICE,
  // Matches the vault key: unreadable while the phone is locked, and never
  // carried to another device in a backup. A PIN verifier that outlived the
  // handset would let someone brute-force it at leisure, off-device.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Enough to be a visible speed bump against offline guessing, low enough that
 * an unlock stays instant for someone with unsteady hands who is already
 * concentrating on entering four digits. Not presented as a KDF — see above for
 * why a large number here would be theatre rather than defence.
 */
const ITERATIONS = 4096;
const SALT_BYTES = 32;

/** Four digits, matching the phone-unlock pattern this user already knows. */
export const PIN_LENGTH = 4;

type StoredPin = {
  readonly salt: string;
  readonly hash: string;
  readonly iterations: number;
};

export function isWellFormedPin(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin);
}

/**
 * Hex rather than base64 because `btoa` is not a global this runtime
 * guarantees — React Native's core does not install one and Expo's WinterCG
 * setup does not either. Twice the characters for a 32-byte salt is a rounding
 * error; a crash on first PIN setup because a global was assumed is not.
 */
function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

async function derive(pin: string, salt: string, iterations: number): Promise<string> {
  let acc = `${salt}:${pin}`;
  for (let i = 0; i < iterations; i += 1) {
    // Salt and PIN are re-mixed every round rather than hashing the previous
    // digest alone, so the chain cannot collapse into a short cycle that makes
    // the iteration count meaningless.
    acc = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${acc}:${salt}:${pin}`, {
      encoding: CryptoEncoding.HEX,
    });
  }
  return acc;
}

/**
 * Compares in time independent of where the first difference falls.
 *
 * Largely theoretical for a local gate, but the alternative is `===` on a
 * secret, and there is no reason to write that.
 */
function equalsConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_ITEM, OPTIONS)) !== null;
}

/** @throws RangeError if `pin` is not exactly {@link PIN_LENGTH} digits. */
export async function setPin(pin: string): Promise<void> {
  if (!isWellFormedPin(pin)) {
    throw new RangeError(`A PIN must be exactly ${PIN_LENGTH} digits.`);
  }

  const salt = toHex(await getRandomBytesAsync(SALT_BYTES));
  const stored: StoredPin = {
    salt,
    hash: await derive(pin, salt, ITERATIONS),
    iterations: ITERATIONS,
  };

  await SecureStore.setItemAsync(PIN_ITEM, JSON.stringify(stored), OPTIONS);
  await resetAttempts();
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_ITEM, OPTIONS);
  await resetAttempts();
}

// --- Rate limiting -------------------------------------------------------

type Attempts = {
  readonly failures: number;
  /** Epoch milliseconds, or `null` when not currently locked out. */
  readonly lockedUntil: number | null;
};

const NO_ATTEMPTS: Attempts = { failures: 0, lockedUntil: null };

/**
 * Escalating delays, capped, and **never** a wipe.
 *
 * Destroying the vault after N failures is the conventional move and it is
 * wrong for this app. The person most likely to enter a wrong PIN repeatedly is
 * the elderly owner of the phone, not an attacker, and the thing destroyed
 * would be the list of medicines they are currently taking. That is a health
 * risk, and it is a worse one than the brute-force exposure it removes —
 * particularly since the encrypted data is protected by a hardware-backed key
 * the PIN does not unlock.
 *
 * The first entry is the penalty after the first failure, the second after the
 * second, and so on; anything past the end uses the last entry. (It was once
 * indexed by the count itself, which starts at one, so the first entry was
 * never used and only three attempts were free, not the four promised below.)
 */
const LOCKOUT_LADDER_MS = [
  0, 0, 0, 0, // first four attempts are free — mistyping is normal
  30_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
];

async function readAttempts(): Promise<Attempts> {
  const raw = await SecureStore.getItemAsync(ATTEMPTS_ITEM, OPTIONS);
  if (!raw) return NO_ATTEMPTS;
  try {
    const parsed = JSON.parse(raw) as Partial<Attempts>;
    if (typeof parsed.failures !== 'number') return NO_ATTEMPTS;
    return {
      failures: parsed.failures,
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : null,
    };
  } catch {
    return NO_ATTEMPTS;
  }
}

async function writeAttempts(attempts: Attempts): Promise<void> {
  await SecureStore.setItemAsync(ATTEMPTS_ITEM, JSON.stringify(attempts), OPTIONS);
}

async function resetAttempts(): Promise<void> {
  await SecureStore.deleteItemAsync(ATTEMPTS_ITEM, OPTIONS);
}

/** Milliseconds remaining on the current lockout; `0` when entry is allowed. */
export async function lockoutRemainingMs(): Promise<number> {
  const { lockedUntil } = await readAttempts();
  if (lockedUntil === null) return 0;
  return Math.max(0, lockedUntil - Date.now());
}

export type PinVerification =
  | { readonly outcome: 'correct' }
  | { readonly outcome: 'incorrect'; readonly lockedForMs: number }
  /** Entry refused without checking, because a lockout is still running. */
  | { readonly outcome: 'locked-out'; readonly lockedForMs: number }
  /** No PIN has been set, so there is nothing to verify against. */
  | { readonly outcome: 'not-set' };

/**
 * Checks a PIN, one check at a time.
 *
 * The attempt counter is a read-modify-write in SecureStore. Run concurrently —
 * digits typed while a check is still deriving its key — six wrong guesses
 * were counted as one and the lockout never began.
 */
export function verifyPin(pin: string): Promise<PinVerification> {
  const run = pendingCheck.then(
    () => checkPin(pin),
    () => checkPin(pin)
  );
  pendingCheck = run.catch(() => undefined);
  return run;
}

let pendingCheck: Promise<unknown> = Promise.resolve();

async function checkPin(pin: string): Promise<PinVerification> {
  const remaining = await lockoutRemainingMs();
  if (remaining > 0) {
    return { outcome: 'locked-out', lockedForMs: remaining };
  }

  const raw = await SecureStore.getItemAsync(PIN_ITEM, OPTIONS);
  if (!raw) return { outcome: 'not-set' };

  const stored = JSON.parse(raw) as StoredPin;
  // Honours the stored iteration count rather than the current constant, so
  // raising ITERATIONS later does not lock out everyone who set a PIN before.
  const candidate = await derive(pin, stored.salt, stored.iterations);

  if (equalsConstantTime(candidate, stored.hash)) {
    await resetAttempts();
    return { outcome: 'correct' };
  }

  const failures = (await readAttempts()).failures + 1;
  const penalty = LOCKOUT_LADDER_MS[Math.min(failures - 1, LOCKOUT_LADDER_MS.length - 1)];
  await writeAttempts({
    failures,
    lockedUntil: penalty > 0 ? Date.now() + penalty : null,
  });

  return { outcome: 'incorrect', lockedForMs: penalty };
}
