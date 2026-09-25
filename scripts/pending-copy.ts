/**
 * Prints every English placeholder awaiting Korean, as a Markdown table with a
 * blank Korean column, ready to hand to the translator.
 *
 *     npm run copy:pending
 */
import { pendingCopyTable } from '../src/i18n/pending.ts';
import { Strings } from '../src/i18n/strings.ts';

console.log(pendingCopyTable(Strings));
