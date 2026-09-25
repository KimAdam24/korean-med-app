import { clearProfile } from '@/features/medications/medication-store';
import { cancelAllReminders } from '@/features/reminders/scheduler';

import { clearPin } from './pin';

/**
 * Everything the app holds, gone: the reminders, the medicines, the PIN.
 *
 * Reminders first. Left scheduled, they would go on ringing "time for your
 * medicine" for a list that no longer exists. A failure to cancel them does
 * not stop the erase: the next sync, against an empty profile, cancels
 * whatever is left. A failure to clear the medicines or the PIN does, and
 * throws — both callers say so (see "Erasing did not finish").
 *
 * Order within the rest is `clearProfile`'s own: the vault key goes first,
 * which is the act that makes the records unreadable.
 */
export async function eraseEverything(): Promise<void> {
  await cancelAllReminders().catch(() => undefined);
  await clearProfile();
  await clearPin();
}
