import { AESEncryptionKey, AESKeySize } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Lifecycle of the single AES-256 key that protects the medication vault
 * (spec §3.3, §4).
 *
 * ## Why a key in SecureStore rather than the records themselves
 *
 * SecureStore is the obvious place to put medication data, and it is the wrong
 * one. Its values are size-limited — Expo's own docs note that some iOS
 * releases reject anything past roughly 2048 bytes — and a user on several
 * prescriptions, with Korean instruction text, passes that easily. Splitting
 * records across many keychain entries would fit, but then every read is N
 * keychain round-trips and the "which keys exist" index becomes its own
 * consistency problem.
 *
 * So SecureStore holds only this key (32 bytes, 44 base64 characters) and the
 * records live in one AES-GCM-sealed file. The keychain still gates access to
 * everything, because the file is meaningless without the key it holds.
 *
 * ## Why not `requireAuthentication`
 *
 * `SecureStore` can demand biometric authentication per-read, which sounds
 * exactly like what §3.3 asks for. It is a trap here: the platform
 * **invalidates those keys whenever the enrolled biometrics change**. A user
 * who adds a second fingerprint — or re-enrols their face after getting new
 * glasses — would come back to a permanently undecryptable medication list,
 * with no warning and no recovery. For someone who depends on that list to take
 * the right pills, silent destruction is a worse failure than the attack it
 * prevents.
 *
 * Authentication is therefore enforced one layer up, in `app-lock`, where a
 * failed or changed biometric costs the user a PIN entry instead of their data.
 */

/**
 * Bumping the suffix orphans the old key, which makes the sealed file
 * undecryptable on purpose — the only safe way to retire a key format.
 */
const VAULT_KEY_ITEM = 'kma.vault.key.v1';

/**
 * Namespaces our keychain entries. Must be passed on every call: an entry
 * written with a service and read without one does not resolve.
 */
const KEYCHAIN_SERVICE = 'korean-med-assistant';

const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: KEYCHAIN_SERVICE,
  /**
   * `WHEN_UNLOCKED` so the key is unreachable while the phone is locked, and
   * `THIS_DEVICE_ONLY` so it never travels in an encrypted backup. Spec §4
   * requires the data be accessible only to the user; a key that restores onto
   * a replacement handset makes "the user" mean "whoever restored the backup".
   *
   * The cost is real and deliberate: on a new device the medication list does
   * not come back and has to be re-scanned. `readVault` is built to detect that
   * case and say so rather than present an empty list as if nothing was lost.
   */
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** SecureStore is unavailable — notably on web, where there is no keychain. */
export class SecureStorageUnavailableError extends Error {
  constructor() {
    super('This device has no secure storage, so medication data cannot be saved.');
    this.name = 'SecureStorageUnavailableError';
  }
}

async function assertAvailable(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new SecureStorageUnavailableError();
  }
}

/**
 * Returns the vault key, or `null` if none has been created yet.
 *
 * The distinction matters to callers: "no key" plus "no file" is a first run,
 * while "no key" plus "a file" means the key was lost and the data with it.
 */
export async function loadVaultKey(): Promise<AESEncryptionKey | null> {
  await assertAvailable();
  const encoded = await SecureStore.getItemAsync(VAULT_KEY_ITEM, KEY_OPTIONS);
  if (!encoded) return null;
  return AESEncryptionKey.import(encoded, 'base64');
}

/**
 * Returns the vault key, generating and persisting one on first use.
 *
 * Not idempotent-safe against concurrent callers: two simultaneous creations
 * would race and the loser's key would be overwritten, stranding anything it
 * had sealed. Callers go through `secure-vault`, which serialises access.
 */
export async function loadOrCreateVaultKey(): Promise<AESEncryptionKey> {
  const existing = await loadVaultKey();
  if (existing) return existing;

  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  // Persist before returning: a key that encrypted a record but never reached
  // the keychain would make that record permanently unreadable.
  await SecureStore.setItemAsync(VAULT_KEY_ITEM, await key.encoded('base64'), KEY_OPTIONS);
  return key;
}

/**
 * Discards the key, which cryptographically erases every sealed record whether
 * or not the file itself can be deleted. This is the strong half of "delete my
 * data" — the file removal in `secure-vault` is the tidy-up.
 */
export async function destroyVaultKey(): Promise<void> {
  await assertAvailable();
  await SecureStore.deleteItemAsync(VAULT_KEY_ITEM, KEY_OPTIONS);
}

/** Shared so `app-lock` scopes its own entries to the same keychain service. */
export { KEYCHAIN_SERVICE };
