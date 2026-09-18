import { randomUUID } from 'expo-crypto';

import {
  destroyVault,
  mutateVault,
  readVault,
  type VaultReadResult,
} from '@/features/security/secure-vault';

import { EMPTY_PROFILE, type MedicationProfile, type MedicationRecord } from './types';

/**
 * The medication profile API (spec §3.3).
 *
 * A thin domain layer over `secure-vault`: this module owns what a medication
 * record *is*, and the vault owns how bytes get encrypted. Keeping them apart
 * means the §3.4 interaction work can extend the record shape without touching
 * anything cryptographic.
 */

export type ProfileLoadResult = VaultReadResult<MedicationProfile>;

/** The fields a caller supplies; the store owns `id` and `addedAt`. */
export type NewMedication = Omit<MedicationRecord, 'id' | 'addedAt'>;

/**
 * Validates a decrypted document before the app trusts it.
 *
 * The vault's GCM tag already proves these bytes are ours and unmodified, so
 * this is not a defence against tampering — it is a defence against *us*: an
 * older build's document shape, or a half-finished migration. A malformed
 * record is dropped rather than repaired, because a medication entry with a
 * missing or non-string name is not something to guess at.
 */
function parseProfile(value: unknown): MedicationProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const doc = value as Partial<MedicationProfile>;
  if (doc.version !== 1 || !Array.isArray(doc.medications)) return null;

  const medications = doc.medications.filter(isMedicationRecord);
  return { version: 1, medications };
}

function isMedicationRecord(value: unknown): value is MedicationRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<MedicationRecord>;
  return (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.name === 'string' &&
    typeof record.addedAt === 'string' &&
    (record.source === 'label-scan' || record.source === 'manual') &&
    typeof record.needsReview === 'boolean' &&
    (record.dosage === undefined || typeof record.dosage === 'string') &&
    (record.instructions === undefined || typeof record.instructions === 'string')
  );
}

export async function loadProfile(): Promise<ProfileLoadResult> {
  const result = await readVault<unknown>();
  if (result.status !== 'ok') return result;

  const profile = parseProfile(result.value);
  if (!profile) {
    // Decryptable but not a shape we recognise. Reported as unrecoverable for
    // the same reason a failed tag check is: the user has data we cannot show,
    // and an empty list would misrepresent that.
    return { status: 'unrecoverable', reason: 'undecryptable' };
  }
  return { status: 'ok', value: profile };
}

/**
 * All mutations funnel through here so every one of them is a single atomic
 * read-modify-write, and so a document the app cannot parse is never silently
 * replaced by one it can.
 */
function updateProfile(
  change: (profile: MedicationProfile) => MedicationProfile
): Promise<MedicationProfile> {
  return mutateVault<MedicationProfile>(EMPTY_PROFILE, (current) => {
    const parsed = parseProfile(current) ?? EMPTY_PROFILE;
    return change(parsed);
  });
}

export async function addMedication(input: NewMedication): Promise<MedicationRecord> {
  const record: MedicationRecord = {
    ...input,
    id: randomUUID(),
    addedAt: new Date().toISOString(),
  };

  await updateProfile((profile) => ({
    ...profile,
    medications: [...profile.medications, record],
  }));

  return record;
}

/**
 * Applies `patch` to one record.
 *
 * `id`, `addedAt` and `source` are not patchable: they say where a record came
 * from, and a scanned entry that could be relabelled as manually confirmed
 * would quietly erase the fact that a machine read the dose.
 */
export function updateMedication(
  id: string,
  patch: Partial<Omit<MedicationRecord, 'id' | 'addedAt' | 'source'>>
): Promise<MedicationProfile> {
  return updateProfile((profile) => ({
    ...profile,
    medications: profile.medications.map((record) =>
      record.id === id ? { ...record, ...patch } : record
    ),
  }));
}

/**
 * Marks a record as checked by the user. Separate from `updateMedication`
 * because confirming a dose you have read is a different act from editing it,
 * and §5's manual-correction flow needs to be able to offer both.
 */
export function confirmMedication(id: string): Promise<MedicationProfile> {
  return updateMedication(id, { needsReview: false });
}

export function removeMedication(id: string): Promise<MedicationProfile> {
  return updateProfile((profile) => ({
    ...profile,
    medications: profile.medications.filter((record) => record.id !== id),
  }));
}

/**
 * Deletes everything, including the encryption key.
 *
 * Also the recovery route out of an `unrecoverable` profile: mutations refuse
 * to overwrite data they cannot read, so a user stranded by a device restore
 * gets here explicitly rather than by a mutation quietly clearing the way.
 */
export function clearProfile(): Promise<void> {
  return destroyVault();
}
