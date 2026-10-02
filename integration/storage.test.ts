/**
 * The storage stack end to end: the encrypted vault, the medication profile on
 * top of it, the PIN store, and the reinstall check — real code throughout,
 * with real AES-GCM, over an in-memory keychain and disk.
 */
import { disk } from './fakes/file-system';
import { keychain } from './fakes/secure-store';

import {
  addMedication,
  clearProfile,
  confirmMedication,
  loadProfile,
  removeMedication,
  updateMedication,
} from '@/features/medications/medication-store';
import { forgetPreviousInstall } from '@/features/security/install-marker';
import { clearPin, hasPin, lockoutRemainingMs, setPin, verifyPin } from '@/features/security/pin';
import {
  VaultUnreadableError,
  destroyVault,
  mutateVault,
  readVault,
} from '@/features/security/secure-vault';

const VAULT = 'file:///document/secure/vault.v1.bin';
const TEMP = `${VAULT}.tmp`;
const VAULT_KEY = 'kma.vault.key.v1';

const medicine = {
  name: 'LISINOPRIL TABLET',
  dosage: '10 MG',
  instructions: 'TAKE 1 TABLET BY MOUTH EVERY DAY',
  source: 'label-scan' as const,
  needsReview: true,
};

describe('the encrypted vault', () => {
  it('stores what it is given, and stores it encrypted', async () => {
    await mutateVault<unknown>({}, () => ({ note: 'LISINOPRIL 10 MG' }));

    const onDisk = Buffer.from(disk.files.get(VAULT)!).toString('latin1');
    expect(onDisk).not.toContain('LISINOPRIL');
    expect(await readVault()).toEqual({ status: 'ok', value: { note: 'LISINOPRIL 10 MG' } });
  });

  it('reports a tampered file as unrecoverable, never as empty', async () => {
    await mutateVault<unknown>({}, () => ({ note: 'x' }));
    const bytes = disk.files.get(VAULT)!;
    bytes[bytes.length - 1] ^= 0xff;

    expect(await readVault()).toEqual({ status: 'unrecoverable', reason: 'undecryptable' });
  });

  it('reports a lost key as unrecoverable', async () => {
    await mutateVault<unknown>({}, () => ({ note: 'x' }));
    keychain.items.delete(VAULT_KEY);

    expect(await readVault()).toEqual({ status: 'unrecoverable', reason: 'key-missing' });
  });

  it('refuses to write over data it cannot read', async () => {
    await mutateVault<unknown>({}, () => ({ note: 'x' }));
    const bytes = disk.files.get(VAULT)!;
    bytes[20] ^= 0xff;
    const damaged = new Uint8Array(bytes);

    await expect(mutateVault<unknown>({}, () => ({ note: 'replacement' }))).rejects.toBeInstanceOf(
      VaultUnreadableError
    );
    expect(disk.files.get(VAULT)).toEqual(damaged);
  });

  it('recovers a replace interrupted between removing the old file and moving in the new', async () => {
    await mutateVault<unknown>({}, () => ({ note: 'newest' }));
    // The moment of the crash: the live file gone, its replacement still the temp.
    disk.files.set(TEMP, disk.files.get(VAULT)!);
    disk.files.delete(VAULT);

    expect(await readVault()).toEqual({ status: 'ok', value: { note: 'newest' } });
    expect(disk.files.has(VAULT)).toBe(true);
    expect(disk.files.has(TEMP)).toBe(false);
  });

  it('does not promote a temp file that was cut short', async () => {
    await mutateVault<unknown>({}, () => ({ note: 'x' }));
    disk.files.set(TEMP, disk.files.get(VAULT)!.slice(0, 20));
    disk.files.delete(VAULT);

    expect(await readVault()).toEqual({ status: 'empty' });
  });

  it('keeps every write when saves overlap', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        mutateVault<{ count: number }>({ count: 0 }, (current) => ({ count: current.count + 1 }))
      )
    );
    expect(await readVault()).toEqual({ status: 'ok', value: { count: 20 } });
  });

  it('erases the key and the file', async () => {
    await mutateVault<unknown>({}, () => ({ note: 'x' }));
    await destroyVault();

    expect(keychain.items.has(VAULT_KEY)).toBe(false);
    expect(disk.files.has(VAULT)).toBe(false);
    expect(await readVault()).toEqual({ status: 'empty' });
  });
});

describe('the medication profile', () => {
  it('adds, edits, confirms and removes a medicine', async () => {
    const saved = await addMedication(medicine);

    await updateMedication(saved.id, { dosage: '20 MG' });
    await confirmMedication(saved.id);
    let profile = await loadProfile();
    expect(profile.status).toBe('ok');
    if (profile.status !== 'ok') return;
    expect(profile.value.medications).toEqual([
      expect.objectContaining({ id: saved.id, dosage: '20 MG', needsReview: false }),
    ]);

    await removeMedication(saved.id);
    profile = await loadProfile();
    expect(profile.status === 'ok' && profile.value.medications).toEqual([]);
  });

  it('refuses to save into a profile written by a newer version, and leaves it alone', async () => {
    const future = { version: 2, medications: [{ id: 'a' }, { id: 'b' }] };
    await mutateVault<unknown>({}, () => future);

    await expect(addMedication(medicine)).rejects.toBeInstanceOf(VaultUnreadableError);
    expect(await readVault()).toEqual({ status: 'ok', value: future });
  });

  it('carries a record it cannot read through a save, untouched', async () => {
    const unknownKind = { id: 'z', name: 'FROM A NEWER VERSION', source: 'pharmacy-sync' };
    await mutateVault<unknown>({}, () => ({ version: 1, medications: [unknownKind] }));

    await addMedication(medicine);

    const raw = await readVault<{ medications: unknown[] }>();
    expect(raw.status === 'ok' && raw.value.medications).toEqual(
      expect.arrayContaining([unknownKind, expect.objectContaining({ name: medicine.name })])
    );
  });

  it('is empty after everything is erased', async () => {
    await addMedication(medicine);
    await clearProfile();
    expect(await loadProfile()).toEqual({ status: 'empty' });
  });
});

describe('records written by another version', () => {
  const fromNewerBuild = {
    id: 'newer-1',
    name: 'VITAMIN D2',
    addedAt: '2026-10-01T00:00:00.000Z',
    source: 'label-scan',
    needsReview: true,
    // Values this build does not know, and one it would read differently.
    nameSource: 'printed-ndc',
    nameIncomplete: false,
    somethingNew: { kept: true },
  };

  it('are written back exactly as found when a save does not touch them', async () => {
    await mutateVault<unknown>({}, () => ({ version: 1, medications: [fromNewerBuild] }));
    await addMedication(medicine);
    const raw = await readVault<{ medications: Record<string, unknown>[] }>();
    expect(raw.status === 'ok' && raw.value.medications.find((record) => record.id === 'newer-1')).toEqual(
      fromNewerBuild
    );
  });

  it('keep what this build does not know when a save does change them', async () => {
    await mutateVault<unknown>({}, () => ({ version: 1, medications: [fromNewerBuild] }));
    await updateMedication('newer-1', { dosage: '1.25 MG' });
    const raw = await readVault<{ medications: Record<string, unknown>[] }>();
    const record = raw.status === 'ok' ? raw.value.medications[0] : undefined;
    expect(record).toMatchObject({ dosage: '1.25 MG', somethingNew: { kept: true }, nameSource: 'printed-ndc' });
  });
});

describe('the PIN', () => {
  it('accepts the PIN that was set and nothing else', async () => {
    await setPin('4821');
    expect(await hasPin()).toBe(true);
    expect(await verifyPin('4821')).toEqual({ outcome: 'correct' });
    expect(await verifyPin('1111')).toEqual({ outcome: 'incorrect', lockedForMs: 0 });
  });

  it('allows four mistakes before making the owner wait', async () => {
    await setPin('4821');
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await verifyPin('0000')).toEqual({ outcome: 'incorrect', lockedForMs: 0 });
    }
    expect(await verifyPin('0000')).toEqual({ outcome: 'incorrect', lockedForMs: 30_000 });
    expect(await lockoutRemainingMs()).toBeGreaterThan(0);
  });

  it('counts every failure when checks overlap', async () => {
    await setPin('4821');
    await Promise.all(Array.from({ length: 6 }, () => verifyPin('0000')));
    // Counted one at a time, the fifth began a lockout the sixth ran into.
    expect(await lockoutRemainingMs()).toBeGreaterThan(0);
  });

  it('forgets the PIN and its failures when cleared', async () => {
    await setPin('4821');
    for (let attempt = 1; attempt <= 5; attempt += 1) await verifyPin('0000');
    await clearPin();

    expect(await hasPin()).toBe(false);
    expect(await lockoutRemainingMs()).toBe(0);
  });
});

describe('a reinstall', () => {
  it("forgets a previous installation's PIN and key when nothing is on disk", async () => {
    // What iOS leaves behind when the app is deleted: the keychain, not the files.
    await setPin('4821');
    keychain.items.set(VAULT_KEY, 'stale');

    await forgetPreviousInstall();

    expect(await hasPin()).toBe(false);
    expect(keychain.items.has(VAULT_KEY)).toBe(false);
  });

  it('keeps everything on an installation that is only being updated', async () => {
    await setPin('4821');
    await addMedication(medicine);

    await forgetPreviousInstall();

    expect(await hasPin()).toBe(true);
    expect((await loadProfile()).status).toBe('ok');
  });

  it('looks only once', async () => {
    await forgetPreviousInstall();
    await setPin('4821');
    await forgetPreviousInstall();
    expect(await hasPin()).toBe(true);
  });
});
