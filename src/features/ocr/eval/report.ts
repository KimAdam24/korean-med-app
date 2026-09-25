/**
 * Prints the evaluation scorecard. Run with: npm run eval
 *
 * The tests enforce the floor — nothing wrong, nothing worse. This shows how
 * far above it the pipeline is, which is the number that moves when capture or
 * parsing improves.
 */
import { CORPUS } from './corpus.ts';
import { FIELD_KINDS, isWorse, scoreCase, type Outcome } from './score.ts';

const totals: Record<Outcome, number> = { correct: 0, withheld: 0, wrong: 0 };
const notes: string[] = [];
let pending = 0;

const pad = (text: string, width: number) => text.padEnd(width);
const idWidth = Math.max(...CORPUS.map((entry) => entry.id.length)) + 2;
console.log(`${pad('case', idWidth)}${FIELD_KINDS.map((kind) => pad(kind, 14)).join('')}${pad('verdict', 10)}edge`);

for (const entry of CORPUS) {
  const score = scoreCase(entry);
  if (score.status === 'pending') {
    pending += 1;
    console.log(`${pad(entry.id, idWidth)}(pending: lines not captured)`);
    continue;
  }

  const cells = FIELD_KINDS.map((kind) => {
    const { outcome, shown } = score.fields[kind];
    totals[outcome] += 1;
    const expected = entry.expected?.[kind];
    if (expected && isWorse(expected, outcome)) {
      notes.push(`${entry.id}: ${kind} improved to ${outcome}; raise its expected`);
    }
    if (outcome === 'wrong') notes.push(`${entry.id}: ${kind} WRONG, shown as "${shown}"`);
    return pad(outcome === 'wrong' ? 'WRONG' : outcome, 14);
  });

  const edge = score.edge ? `${score.edge.side}: ${score.edge.fields.join(', ') || '(no field)'}` : '-';
  console.log(`${pad(entry.id, idWidth)}${cells.join('')}${pad(score.verdict, 10)}${edge}`);
}

const scored = totals.correct + totals.withheld + totals.wrong;
console.log(
  `\n${scored} field(s) scored: ${totals.correct} correct, ${totals.withheld} withheld, ` +
    `${totals.wrong} wrong. ${pending} case(s) pending.`
);
for (const note of notes) console.log(`- ${note}`);
