/**
 * Prints every English placeholder awaiting Korean, as a Markdown table with a
 * blank Korean column, ready to hand to the translator; then the strings shown
 * in Korean completed by AI, which the reviewer has yet to review.
 *
 *     npm run copy:pending
 *
 * Or writes the batch as a spreadsheet, with where each string appears and
 * when (see `copy-context.ts`), the unreviewed Korean drafts beside the
 * English (`content-drafts/copy-batch.draft.json`, or the Korean completed by
 * AI, which goes to the reviewer too), and columns for the reviewer's final wording and whether it
 * changed the draft:
 *
 *     npm run copy:pending -- --export [file.csv]
 *
 * Or the dosing phrases (`content-drafts/sig-phrases.draft.md`) as a sheet in
 * the same shape, the limits that could read as schedules first:
 *
 *     npm run copy:pending -- --export-phrases [file.csv]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { aiCopy, pendingCopyTable, reviewBatch } from '../src/i18n/pending.ts';
import { Strings } from '../src/i18n/strings.ts';
import { SECTIONS } from './copy-context.ts';
import { exportCsv, exportRows, heldBack, missingContext, missingDrafts, type CopyDrafts } from './copy-export.ts';
import { parseSigDraft, phrasesCsv } from './sig-phrases-export.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--export');
const phrasesAt = args.indexOf('--export-phrases');
const today = new Date().toISOString().slice(0, 10);

if (phrasesAt !== -1) {
  const rows = parseSigDraft(readFileSync(new URL('../content-drafts/sig-phrases.draft.md', import.meta.url), 'utf8'));
  const file = resolve(args[phrasesAt + 1] ?? `sig-phrases-${today}.csv`);
  writeFileSync(file, phrasesCsv(rows), 'utf8');
  console.log(`${rows.length} phrase row(s) written to ${file}`);
} else if (at === -1) {
  console.log(pendingCopyTable(Strings));
  const ai = aiCopy(Strings);
  if (ai.length > 0) {
    console.log('');
    console.log(`${ai.length} string(s) shown in Korean completed by AI, for the reviewer to review: ${ai.map(({ key }) => key).join(', ')}`);
  }
} else {
  const pending = reviewBatch(Strings);
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
  const file = resolve(args[at + 1] ?? `copy-batch-${today}.csv`);
  writeFileSync(file, exportCsv(rows, drafts), 'utf8');
  const blank = rows.filter((row) => !(row.copy.ko ?? drafts.strings[row.copy.key]?.ko)).length;
  console.log(`${rows.length} string(s) written to ${file}; ${rows.length - blank} drafted, ${blank} left for the reviewer to write`);
  for (const section of SECTIONS) {
    const count = rows.filter((row) => row.context.section === section).length;
    if (count > 0) console.log(`  ${String(count).padStart(3)}  ${section}`);
  }
  const held = heldBack(pending);
  if (held.length > 0) {
    console.log(`Held back, their features hidden (src/features/scope.ts): ${held.join(', ')}`);
  }
}
