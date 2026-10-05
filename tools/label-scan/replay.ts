/**
 * Replays the app's own label lookup (`findApprovedUses`), two versions of
 * it, against DailyMed and RxNav as fetch.ts read them, for a clean reading
 * of a typical pharmacy bottle of every product of the top medicines, and
 * says what changed between them. See README.md.
 *
 *     node --experimental-strip-types --no-warnings tools/label-scan/replay.ts [--before <ref>] [--after <ref>] [--top 200]
 *
 * `--before` defaults to HEAD, `--after` to the working tree. A ref's code is
 * taken out of git into data/refs/, so any commit or branch can be replayed.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DATA,
  FILES,
  REPO,
  bottlesOf,
  readJson,
  readLabels,
  stand,
  strengthsKey,
  type Asked,
  type Bottle,
  type ClinicalDrugs,
  type Drug,
  type Lists,
} from './shared.ts';

const args = process.argv.slice(2);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const TOP = Number(option('--top') ?? 200);

/** What the lookup was, of the version replayed. */
type Lookup = { findApprovedUses: (target: unknown) => Promise<{ status: string; uses?: { content: { label: { setId: string; title: string } } } }> };

/** A version of the lookup: the working tree's, or a ref's taken out of git. */
async function version(ref: string | undefined): Promise<{ name: string; lookup: Lookup }> {
  if (!ref) {
    return { name: 'working tree', lookup: (await import(pathToFileURL(resolve(REPO, 'src/features/drugs/approved-uses.ts')).href)) as Lookup };
  }
  const sha = execFileSync('git', ['rev-parse', '--short', ref], { cwd: REPO, encoding: 'utf8' }).trim();
  const root = resolve(DATA, 'refs', sha);
  // Its src/ (the lookup, and all it imports), as it was at the ref.
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', sha, '--', 'src'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter((path) => /\.(ts|tsx|json)$/.test(path));
  for (const path of files) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, execFileSync('git', ['show', `${sha}:${path}`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 }));
  }
  return { name: `${ref} (${sha})`, lookup: (await import(pathToFileURL(resolve(root, 'src/features/drugs/approved-uses.ts')).href)) as Lookup };
}

type Outcome = { status: string; label: string | null; title: string | null; asked: Asked };

const drugs = readJson<Drug[]>(FILES.drugs, []).filter((drug) => drug.rank <= TOP);
const identified = drugs.filter((drug) => drug.status === 'identified');
const data = {
  lists: readJson<Lists>(FILES.lists, {}),
  productLists: readJson<Lists>(FILES.productLists, {}),
  clinicalDrugs: readJson<ClinicalDrugs>(FILES.clinicalDrugs, {}),
  labels: await readLabels(),
};
if (data.labels.size === 0) throw new Error('No labels fetched: run tools/label-scan/fetch.ts first.');
const bottles = new Map(identified.map((drug) => [drug.name, bottlesOf(drug, data.lists, data.labels)]));
const { fetcher, asked } = stand(data);
globalThis.fetch = fetcher;

/** One bottle, looked up; where the release is asked, answered as the bottle is. */
async function lookUp(lookup: Lookup, drug: Drug, bottle: Bottle): Promise<Outcome> {
  const target = {
    kind: 'ingredients',
    rxcui: drug.rxcui,
    ingredients: drug.ingredients,
    form: bottle.form,
    salts: bottle.salts,
    release: bottle.release,
    releaseToken: bottle.token,
    brand: bottle.brand,
    strengths: bottle.strengths,
    labelKind: bottle.kind,
  };
  Object.assign(asked, { lists: 0, packaging: 0, labels: 0, rxnav: 0 });
  let found = await lookup.findApprovedUses(target);
  let status = found.status;
  if (found.status === 'releaseUnknown') {
    // The user, holding the bottle, says what it shows: no marker on one
    // released at once.
    found = await lookup.findApprovedUses({ ...target, release: bottle.release ?? 'immediate' });
    status = `${found.status} after the question`;
  }
  const label = found.uses?.content.label ?? null;
  return { status, label: label?.setId ?? null, title: label?.title ?? null, asked: { ...asked } };
}

const before = await version(option('--before') ?? 'HEAD');
const after = await version(option('--after'));
const results = new Map<string, { bottle: Bottle; before: Outcome; after: Outcome }[]>();
for (const drug of identified) {
  const rows = [];
  for (const bottle of bottles.get(drug.name) ?? []) {
    rows.push({ bottle, before: await lookUp(before.lookup, drug, bottle), after: await lookUp(after.lookup, drug, bottle) });
  }
  results.set(drug.name, rows);
}

// --- What changed ----------------------------------------------------------

const shows = (outcome: Outcome) => outcome.status === 'found' || outcome.status === 'found after the question';
const describe = (bottle: Bottle) =>
  `${bottle.drug} ${strengthsKey(bottle.strengths)} ${bottle.release ? `${bottle.release} ` : ''}${bottle.form.toLowerCase()}${bottle.salts.length ? ` (${bottle.salts.join(' ')})` : ''}${bottle.token ? ` ${bottle.token.toUpperCase()}` : ''}${bottle.brand.length ? ` [${bottle.brand.join(' ')}]` : ''}${bottle.kind === 'otc' ? ' OTC' : ''}`;
const rows = [...results.values()].flat();
const out: string[] = [];
const fetched = new Date(statSync(FILES.labels).mtime).toISOString().slice(0, 10);
out.push(`Label scan replay: ${before.name} -> ${after.name}`);
out.push(`Data fetched up to ${fetched}: ${identified.length} of the top ${drugs.length} identified, ${rows.length} bottles, ${data.labels.size} labels.`);
out.push('');
for (const [name, side] of [[before.name, 'before'], [after.name, 'after']] as const) {
  const mostCommon = identified.filter((drug) => {
    const first = results.get(drug.name)?.[0];
    return first !== undefined && shows(first[side]);
  }).length;
  const all = rows.filter((row) => shows(row[side])).length;
  const askedFirst = identified.filter((drug) => results.get(drug.name)?.[0]?.[side].status.endsWith('after the question')).length;
  const asked = rows.filter((row) => row[side].status.endsWith('after the question')).length;
  out.push(`${name}: the most common bottle shows a label for ${mostCommon} of ${identified.length}${askedFirst ? ` (${askedFirst} after the question)` : ''}; all bottles ${all} of ${rows.length}${asked ? ` (${asked} after the question)` : ''}.`);
  const tally = new Map<string, number>();
  for (const row of rows) tally.set(row[side].status, (tally.get(row[side].status) ?? 0) + 1);
  out.push(`  ${[...tally].sort((a, b) => b[1] - a[1]).map(([status, n]) => `${status} ${n}`).join(', ')}`);
  const percentile = (kind: keyof Asked, p: number) => {
    const sorted = rows.map((row) => row[side].asked[kind]).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  };
  out.push(
    `  requests per lookup, median / 90th / 99th percentile / most: ${(['lists', 'packaging', 'labels', 'rxnav'] as const)
      .map((kind) => `${kind} ${percentile(kind, 0.5)}/${percentile(kind, 0.9)}/${percentile(kind, 0.99)}/${percentile(kind, 1)}`)
      .join(', ')}`
  );
}

const lost = rows.filter((row) => shows(row.before) && !shows(row.after));
const gained = rows.filter((row) => !shows(row.before) && shows(row.after));
const changed = rows.filter((row) => shows(row.before) && shows(row.after) && row.before.label !== row.after.label);
const otherwise = rows.filter((row) => !shows(row.before) && !shows(row.after) && row.before.status !== row.after.status);
out.push('');
out.push(`Lost, a label before and none after (${lost.length}):`);
for (const row of lost) out.push(`  ${describe(row.bottle)}: ${row.after.status}; was ${row.before.title}`);
out.push(`Gained, none before and a label after (${gained.length}):`);
for (const row of gained) out.push(`  ${describe(row.bottle)}: was ${row.before.status}; now ${row.after.title}`);
out.push(`Another label shown (${changed.length}):`);
for (const row of changed) out.push(`  ${describe(row.bottle)}: ${row.before.title} -> ${row.after.title}`);
out.push(`Refused otherwise (${otherwise.length}):`);
for (const row of otherwise) out.push(`  ${describe(row.bottle)}: ${row.before.status} -> ${row.after.status}`);

const stem = `replay-${before.name.replace(/\W+/g, '_')}-to-${after.name.replace(/\W+/g, '_')}`;
writeFileSync(resolve(DATA, `${stem}.txt`), `${out.join('\n')}\n`);
writeFileSync(resolve(DATA, `${stem}.json`), JSON.stringify(Object.fromEntries(results)));
// The summary, and where the rest is.
console.log(out.slice(0, out.indexOf('') + 1 + 2 * 3).join('\n'));
console.log(`Lost ${lost.length}, gained ${gained.length}, another label ${changed.length}, refused otherwise ${otherwise.length}: data/${stem}.txt`);
