/**
 * An in-memory keychain standing in for expo-secure-store.
 *
 * Same surface the app uses, same semantics that matter: values are strings,
 * a missing item reads as null, and every call is asynchronous. `failNextCall`
 * makes the next operation throw, as a keychain does when the device is
 * locked or the item's access class forbids it.
 */
const items = new Map<string, string>();
let failNext = false;
type Operation = 'get' | 'set' | 'delete';
/** Targeted failures: the next `operation` on `key` throws, once. */
const failures: { operation: Operation; key: string }[] = [];

function guard(operation: Operation, key: string): void {
  if (failNext) {
    failNext = false;
    throw new Error('Keychain unavailable (injected failure).');
  }
  const index = failures.findIndex((failure) => failure.operation === operation && failure.key === key);
  if (index >= 0) {
    failures.splice(index, 1);
    throw new Error(`Keychain ${operation} of ${key} failed (injected failure).`);
  }
}

export const WHEN_UNLOCKED = 'WHEN_UNLOCKED';
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';
export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY';

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export async function getItemAsync(key: string): Promise<string | null> {
  guard('get', key);
  return items.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  guard('set', key);
  items.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  guard('delete', key);
  items.delete(key);
}

export const keychain = {
  items,
  reset(): void {
    items.clear();
    failNext = false;
    failures.length = 0;
  },
  failNextCall(): void {
    failNext = true;
  },
  /**
   * Makes the next `operation` on one item throw — for failures partway
   * through a sequence, such as an erase that removes the vault key and then
   * cannot remove the PIN.
   */
  failNext(operation: Operation, key: string): void {
    failures.push({ operation, key });
  },
};
