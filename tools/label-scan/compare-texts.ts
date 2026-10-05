/**
 * Of a replay's bottles shown another label, whether the label's own words
 * (what the card shows) changed too, and how: the same text from another
 * labeler, or other text. Run after replay.ts, with the same refs.
 *
 *     node --experimental-strip-types --no-warnings --max-old-space-size=8192 tools/label-scan/compare-texts.ts <replay .json in data/>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readIndications } from '../../src/features/drugs/approved-uses.ts';

import { DATA, readLabels } from './shared.ts';

type Row = { bottle: { drug: string }; before: { status: string; label: string | null }; after: { status: string; label: string | null } };
const file = process.argv[2];
if (!file) throw new Error('Give the replay .json to compare, from tools/label-scan/data/.');
const results = JSON.parse(readFileSync(resolve(DATA, file), 'utf8')) as Record<string, Row[]>;
const labels = await readLabels();

const shown = (setid: string) => {
  const read = readIndications(labels.get(setid)!.xml);
  return (read.summary ?? read.section ?? '').replace(/\s+/g, ' ').trim();
};
const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));

let same = 0;
const other: { drug: string; overlap: number; before: string; after: string }[] = [];
for (const rows of Object.values(results)) {
  for (const row of rows) {
    if (!row.before.label || !row.after.label || row.before.label === row.after.label) continue;
    const before = shown(row.before.label);
    const after = shown(row.after.label);
    if (before === after) {
      same++;
      continue;
    }
    const a = words(before);
    const b = words(after);
    const overlap = [...a].filter((word) => b.has(word)).length / Math.max(1, new Set([...a, ...b]).size);
    other.push({ drug: row.bottle.drug, overlap, before, after });
  }
}
console.log(`Another label shown: ${same + other.length}; the same words ${same}; other words ${other.length}.`);
for (const row of other.sort((x, y) => x.overlap - y.overlap)) {
  console.log(`\n${row.drug} (words shared ${Math.round(row.overlap * 100)}%)\n  before: ${row.before.slice(0, 300)}\n  after:  ${row.after.slice(0, 300)}`);
}
