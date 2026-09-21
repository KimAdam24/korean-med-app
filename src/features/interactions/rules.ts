import type { InteractionRule } from './types';

/**
 * The interaction rule table.
 *
 * **Empty, deliberately, and it must stay empty until reviewed.**
 *
 * The engine around it is finished and tested. What is missing is the data,
 * and the data is medical content: each row asserts that two medicines should
 * not be combined, shown to someone who will act on it and cannot check it.
 * Writing plausible rows from memory would produce a table that looks
 * authoritative and is unverifiable, which is the failure this app is built to
 * avoid — the same reason no Korean ingredient name appears in
 * `features/drugs/ingredients`.
 *
 * ## Filling it
 *
 * The sources decided on are:
 *
 *   - **ONC high-priority drug–drug interactions.** An expert-panel list
 *     published as supplementary tables to the JAMIA paper (Phansalkar et al.),
 *     intended for exactly this use: the interactions worth interrupting
 *     someone over. Not an API — the rows are transcribed.
 *   - **CredibleMeds QT list.** Drugs with a known risk of Torsades de Pointes.
 *     Free to use, but registration and its terms apply, which is a decision to
 *     take before transcribing rather than after.
 *
 * Each row needs `source` filled in precisely enough to find it again, and
 * `effect` checkable against that source by a reviewer.
 *
 * ## Until then
 *
 * `checkInteractions` returns no findings and reports every record as
 * unchecked. That is the honest state, and it is the reason the UI must not
 * present "no interactions found" as reassurance — a point the check's return
 * type makes hard to ignore.
 */
export const INTERACTION_RULES: readonly InteractionRule[] = [];
