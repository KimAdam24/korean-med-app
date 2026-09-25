/**
 * Prints every English placeholder awaiting Korean, as a Markdown table with a
 * blank Korean column, ready to hand to the translator.
 *
 *     npm run copy:pending
 *
 * Or writes the batch as a spreadsheet, with where each string appears and
 * when (see `copy-context.ts`), the unreviewed Korean drafts beside the
 * English (`content-drafts/copy-batch.draft.json`), and columns for her final
 * wording and whether it changed the draft:
 *
 *     npm run copy:pending -- --export [file.csv]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { pendingCopy, pendingCopyTable } from '../src/i18n/pending.ts';
import { Strings } from '../src/i18n/strings.ts';
import { SECTIONS } from './copy-context.ts';
import { exportCsv, exportRows, missingContext, missingDrafts, type CopyDrafts } from './copy-export.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--export');

if (at === -1) {
  console.log(pendingCopyTable(Strings));
} else {
  const pending = pendingCopy(Strings);
  const drafts: CopyDrafts = JSON.parse(
    readFileSync(new URL('../content-drafts/copy-batch.draft.json', import.meta.url), 'utf8')
  );
  const problems = [
    ...missingContext(pending).map((key) => `${key}: no context in scripts/copy-context.ts`),
    ...missingDrafts(pending, drafts).map((key) => `${key}: no draft, and no reason, in content-drafts/copy-batch.draft.json`),
  ];
  if (problems.length > 0) {
    console.error(`Not exported; ${problems.length} string(s) need attention:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  const rows = exportRows(pending);
  const file = resolve(args[at + 1] ?? `copy-batch-${new Date().toISOString().slice(0, 10)}.csv`);
  writeFileSync(file, exportCsv(rows, drafts), 'utf8');
  const blank = rows.filter((row) => !drafts.strings[row.copy.key]?.ko).length;
  console.log(`${rows.length} string(s) written to ${file}; ${rows.length - blank} drafted, ${blank} left for her to write`);
  for (const section of SECTIONS) {
    const count = rows.filter((row) => row.context.section === section).length;
    if (count > 0) console.log(`  ${String(count).padStart(3)}  ${section}`);
  }
}
