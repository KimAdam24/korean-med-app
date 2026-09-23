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

function guard(): void {
  if (failNext) {
    failNext = false;
    throw new Error('Keychain unavailable (injected failure).');
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
  guard();
  return items.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  guard();
  items.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  guard();
  items.delete(key);
}

export const keychain = {
  items,
  reset(): void {
    items.clear();
    failNext = false;
  },
  failNextCall(): void {
    failNext = true;
  },
};
