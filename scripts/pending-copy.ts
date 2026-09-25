/**
 * Prints every English placeholder awaiting Korean, as a Markdown table with a
 * blank Korean column, ready to hand to the translator.
 *
 *     npm run copy:pending
 *
 * Or writes the batch as a spreadsheet, with where each string appears and
 * when, strings on screen today first (see `copy-context.ts`):
 *
 *     npm run copy:pending -- --export [file.csv]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { pendingCopy, pendingCopyTable } from '../src/i18n/pending.ts';
import { Strings } from '../src/i18n/strings.ts';
import { SECTIONS } from './copy-context.ts';
import { exportCsv, exportRows, missingContext } from './copy-export.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--export');

if (at === -1) {
  console.log(pendingCopyTable(Strings));
} else {
  const pending = pendingCopy(Strings);
  const missing = missingContext(pending);
  if (missing.length > 0) {
    console.error(`No context for ${missing.length} string(s); add them to scripts/copy-context.ts:`);
    for (const key of missing) console.error(`  ${key}`);
    process.exit(1);
  }
  const rows = exportRows(pending);
  const file = resolve(args[at + 1] ?? `copy-batch-${new Date().toISOString().slice(0, 10)}.csv`);
  writeFileSync(file, exportCsv(rows), 'utf8');
  console.log(`${rows.length} string(s) written to ${file}`);
  for (const section of SECTIONS) {
    const count = rows.filter((row) => row.context.section === section).length;
    if (count > 0) console.log(`  ${String(count).padStart(3)}  ${section}`);
  }
}
