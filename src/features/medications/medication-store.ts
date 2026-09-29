import { randomUUID } from 'expo-crypto';

import {
  VaultUnreadableError,
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
    (record.instructions === undefined || typeof record.instructions === 'string') &&
    isIdentity(record.identity) &&
    isNameMatch(record.nameMatch) &&
    (record.nameIncomplete === undefined || record.nameIncomplete === true) &&
    isReminderTimes(record.reminders)
  );
}

/**
 * Held to the same standard as the identity: a reminder list that is present
 * but malformed is not quietly dropped, because a medicine whose reminders
 * vanished on read would stop ringing with nothing to say why. The record is
 * kept as found instead (see `updateProfile`), unread.
 */
function isReminderTimes(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    Array.isArray(value) &&
    value.every(
      (time) =>
        typeof time === 'object' &&
        time !== null &&
        Number.isInteger((time as { hour: unknown }).hour) &&
        Number.isInteger((time as { minute: unknown }).minute) &&
        (time as { hour: number }).hour >= 0 &&
        (time as { hour: number }).hour <= 23 &&
        (time as { minute: number }).minute >= 0 &&
        (time as { minute: number }).minute <= 59
    )
  );
}

/**
 * Held to the same standard: a match that is present but malformed would look
 * up some other medicine's label under this one's name.
 */
function isNameMatch(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const match = value as Record<string, unknown>;
  return (
    typeof match.rxcui === 'string' &&
    typeof match.matched === 'string' &&
    Array.isArray(match.ingredients) &&
    match.ingredients.length > 0 &&
    match.ingredients.every((name) => typeof name === 'string')
  );
}

/**
 * A partial identity is worse than none: a record carrying an `rxcui` but no
 * `ndc11` would look authoritative to §3.4 while being untraceable back to the
 * package it came from. Either both are present and well-formed, or the record
 * is treated as having no identity at all.
 */
function isIdentity(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const identity = value as Record<string, unknown>;
  if (typeof identity.rxcui !== 'string' || typeof identity.ndc11 !== 'string') return false;

  // Absent is fine — older records predate it. Present but malformed is not:
  // a half-read ingredient list would make an interaction check quietly
  // incomplete, which is worse than one that knows it has nothing to go on.
  if (identity.ingredients === undefined) return true;
  return (
    Array.isArray(identity.ingredients) &&
    identity.ingredients.every((name) => typeof name === 'string')
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
 *
 * That promise was not kept until a review found the fallback: a document
 * this build could not parse was treated as empty, so saving one new medicine
 * — after an app update rolled back, say — replaced the whole list with it. A
 * document in a shape this build does not know is now refused outright, and a
 * record it cannot read is written back exactly as it was found rather than
 * dropped: it may be perfectly good data from a newer version.
 */
function updateProfile(
  change: (profile: MedicationProfile) => MedicationProfile
): Promise<MedicationProfile> {
  return mutateVault<unknown>(EMPTY_PROFILE, (current) => {
    const parsed = parseProfile(current);
    if (!parsed) throw new VaultUnreadableError('undecryptable');

    const raw = (current as { medications: unknown[] }).medications;
    const unreadable = raw.filter((record) => !isMedicationRecord(record));
    const next = change(parsed);
    return { ...(current as object), ...next, medications: [...next.medications, ...unreadable] };
  }).then((written) => parseProfile(written) ?? EMPTY_PROFILE);
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
