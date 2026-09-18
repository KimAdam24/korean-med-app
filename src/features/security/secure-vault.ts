import { AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { utf8Decode, utf8Encode } from './utf8';
import { loadOrCreateVaultKey, loadVaultKey, destroyVaultKey } from './vault-key';

/**
 * Encrypted-at-rest document storage for extracted medication data (spec §3.3).
 *
 * One JSON document, sealed with AES-GCM under the key from `vault-key`, in a
 * single file. The threat this actually defends against is a phone that leaves
 * the user's hands — lost, resold, repaired, or handed to a relative — where
 * the filesystem may be readable but the keychain is not.
 *
 * Nothing here ever sees a photograph. Spec §4 allows only extracted structured
 * data to persist, and the capture path in `transient-capture` deletes the
 * image before this module is reachable at all.
 */

const VAULT_DIRECTORY = 'secure';
const VAULT_FILENAME = 'vault.v1.bin';
/** A partial write lands here first, so the live file is never half-replaced. */
const VAULT_TEMP_FILENAME = 'vault.v1.bin.tmp';

/**
 * Prefixed to the sealed bytes and also fed in as GCM additional authenticated
 * data. Being in the AAD is the point: an attacker who edits the version byte
 * to force an older, weaker parse gets an authentication failure rather than a
 * downgrade.
 */
const FORMAT_VERSION = 1;
const AAD = utf8Encode('kma-vault-v1');

/** Both are the AES-GCM defaults; stated explicitly so a future default change cannot silently break old files. */
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export type VaultReadResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  /** Nothing has been saved yet. A genuinely empty vault, safe to show as empty. */
  | { readonly status: 'empty' }
  /**
   * Data exists but cannot be decrypted. Never conflated with `empty`: showing
   * an empty medication list to someone who saved one would invite them to
   * re-add medicines they are already taking, or to conclude they take none.
   */
  | {
      readonly status: 'unrecoverable';
      /**
       * `key-missing` is the ordinary cause — a restore onto a new device,
       * where the device-bound key did not travel. `undecryptable` means the
       * key is present but the file failed authentication: corruption, a
       * truncated write, or tampering.
       */
      readonly reason: 'key-missing' | 'undecryptable';
    };

/**
 * Raised when a mutation is attempted on a vault whose current contents cannot
 * be read. Writing anyway would replace unreadable-but-present medication data
 * with a fresh document, turning a recoverable-looking problem into a certain
 * loss. Callers that genuinely mean "discard whatever is there and start over"
 * call `destroyVault` first, which makes the intent explicit.
 */
export class VaultUnreadableError extends Error {
  constructor(readonly reason: 'key-missing' | 'undecryptable') {
    super(`The saved medication data could not be read (${reason}).`);
    this.name = 'VaultUnreadableError';
  }
}

function vaultDirectory(): Directory {
  return new Directory(Paths.document, VAULT_DIRECTORY);
}

function vaultFile(): File {
  return new File(vaultDirectory(), VAULT_FILENAME);
}

/**
 * Serialises vault access.
 *
 * Two things need it. `loadOrCreateVaultKey` has a create-race that would
 * strand data if two callers generated keys at once, and read-modify-write is
 * not atomic on its own — two medications added at the same moment would
 * otherwise leave only the one that wrote last.
 *
 * The queued functions are the `*Unlocked` helpers below, never the exported
 * wrappers: re-entering `serialise` from inside a serialised operation would
 * wait on a queue entry that cannot complete until the wait ends.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialise<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  // Swallow rejections on the chain itself so one failed write does not reject
  // every operation queued behind it; the caller still sees its own rejection.
  queue = next.catch(() => undefined);
  return next;
}

async function readUnlocked<T>(): Promise<VaultReadResult<T>> {
  const file = vaultFile();
  const key = await loadVaultKey();

  if (!file.exists) {
    // No file and no key is a first run. No file but a key is also fine: the
    // key was created eagerly and nothing has been saved through it yet.
    return { status: 'empty' };
  }

  if (!key) {
    return { status: 'unrecoverable', reason: 'key-missing' };
  }

  try {
    const stored = await file.bytes();
    if (stored.length === 0 || stored[0] !== FORMAT_VERSION) {
      return { status: 'unrecoverable', reason: 'undecryptable' };
    }

    // `slice`, not `subarray`: a subarray is a view carrying a `byteOffset`,
    // and a native module that reads the backing ArrayBuffer without honouring
    // that offset would silently hand the version byte to the decrypter. The
    // copy costs one small allocation and removes the question entirely.
    const sealed = AESSealedData.fromCombined(stored.slice(1), {
      ivLength: IV_LENGTH,
      tagLength: TAG_LENGTH,
    });
    const plaintext = await aesDecryptAsync(sealed, key, {
      output: 'bytes',
      additionalData: AAD,
    });

    return { status: 'ok', value: JSON.parse(utf8Decode(plaintext)) as T };
  } catch {
    // Covers a failed GCM tag check, a truncated file, and malformed JSON
    // alike. All three mean the same thing to the caller: this data is gone,
    // and pretending otherwise would be the dangerous choice.
    return { status: 'unrecoverable', reason: 'undecryptable' };
  }
}

/**
 * Seals `value` and replaces the vault atomically.
 *
 * The write goes to a temporary file and is then moved over the live one. An
 * in-place write interrupted by the OS killing the app would leave a file whose
 * GCM tag no longer matches, and because there is exactly one key and one file,
 * that is not a corrupted record — it is the whole medication list.
 */
async function writeUnlocked<T>(value: T): Promise<void> {
  const key = await loadOrCreateVaultKey();
  const plaintext = utf8Encode(JSON.stringify(value));
  const sealed = await aesEncryptAsync(plaintext, key, { additionalData: AAD });
  const combined = await sealed.combined('bytes');

  const envelope = new Uint8Array(combined.length + 1);
  envelope[0] = FORMAT_VERSION;
  envelope.set(combined, 1);

  vaultDirectory().create({ intermediates: true, idempotent: true });

  const temp = new File(vaultDirectory(), VAULT_TEMP_FILENAME);
  // A leftover temp file means a previous write was interrupted; it is stale by
  // definition, so overwrite rather than treat it as meaningful.
  temp.create({ overwrite: true });
  temp.write(envelope);
  // `moveSync` mutates `temp` to point at the destination, so `temp` must not
  // be reused after this line.
  temp.moveSync(vaultFile(), { overwrite: true });
}

export function readVault<T>(): Promise<VaultReadResult<T>> {
  return serialise(() => readUnlocked<T>());
}

/**
 * Read, transform, write — with no window in which another caller can
 * interleave. `mutate` receives the current document, or `fallback` when the
 * vault is empty.
 *
 * @throws VaultUnreadableError if existing data cannot be decrypted.
 */
export function mutateVault<T>(
  fallback: T,
  mutate: (current: T) => T | Promise<T>
): Promise<T> {
  return serialise(async () => {
    const current = await readUnlocked<T>();
    if (current.status === 'unrecoverable') {
      throw new VaultUnreadableError(current.reason);
    }

    const next = await mutate(current.status === 'ok' ? current.value : fallback);
    await writeUnlocked(next);
    return next;
  });
}

/**
 * Erases the vault: the key first, then the file.
 *
 * Order is deliberate. Dropping the key is the operation that actually makes
 * the data unrecoverable, and it either succeeds or throws. If the file removal
 * then fails, what survives on disk is ciphertext with no key anywhere — which
 * is the outcome we wanted regardless.
 */
export function destroyVault(): Promise<void> {
  return serialise(async () => {
    await destroyVaultKey();

    for (const file of [vaultFile(), new File(vaultDirectory(), VAULT_TEMP_FILENAME)]) {
      try {
        if (file.exists) file.delete();
      } catch {
        // Already covered by the key deletion above.
      }
    }
  });
}
