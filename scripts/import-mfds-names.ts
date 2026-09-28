/**
 * Imports 식약처's Korean ingredient names into `src/features/drugs/mfds-names.ts`.
 *
 *     DATA_GO_KR_KEY=... node --experimental-strip-types scripts/import-mfds-names.ts --fetch [--url URL]
 *     node --experimental-strip-types scripts/import-mfds-names.ts --file saved-response.json
 *
 * Options: `--ko-field` and `--en-field` name the row fields holding the
 * Korean and English ingredient names (defaults in `mfds-import.ts`,
 * `DEFAULT_FIELDS`); `--dry-run` reports without writing.
 *
 * PARKED 2026-09-28: the key cannot be obtained; see `docs/blocked-on-data.md`,
 * which also notes that the service has moved on to version 08.
 *
 * NOT YET RUN AGAINST REAL DATA. The endpoint and field names below are
 * assumed from 식약처's product-approval service; confirm both against a real
 * response when the key arrives, and check the report before committing the
 * table: how many names matched, and which were left out and why.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import {
  DEFAULT_FIELDS,
  agreeNames,
  extractPairs,
  matchRxNorm,
  tableModule,
  type ProductRow,
  type RxConcept,
} from './mfds-import.ts';

/** Assumed: 식약처 의약품 제품 허가정보, detail operation. Confirm with the key. */
const DEFAULT_URL = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService06/getDrugPrdtPrmsnDtlInq05';
const RXNAV = 'https://rxnav.nlm.nih.gov/REST';
const OUT = new URL('../src/features/drugs/mfds-names.ts', import.meta.url);

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const fields = { ko: option('--ko-field') ?? DEFAULT_FIELDS.ko, en: option('--en-field') ?? DEFAULT_FIELDS.en };

/** data.go.kr's JSON: `{ body: { items: [...] | { item: [...] }, totalCount } }`, or a bare array. */
function itemsOf(payload: unknown): ProductRow[] {
  if (Array.isArray(payload)) return payload.flatMap(itemsOf);
  const body = (payload as { body?: { items?: unknown } })?.body;
  const items = body?.items;
  if (Array.isArray(items)) return items as ProductRow[];
  const item = (items as { item?: unknown })?.item;
  if (Array.isArray(item)) return item as ProductRow[];
  if (item && typeof item === 'object') return [item as ProductRow];
  return [];
}

async function fetchRows(url: string, key: string): Promise<ProductRow[]> {
  const rows: ProductRow[] = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({ serviceKey: key, pageNo: String(page), numOfRows: '100', type: 'json' });
    const response = await fetch(`${url}?${query}`);
    if (!response.ok) throw new Error(`data.go.kr answered ${response.status} on page ${page}`);
    const payload = await response.json();
    const items = itemsOf(payload);
    rows.push(...items);
    const total = Number((payload as { body?: { totalCount?: unknown } })?.body?.totalCount ?? 0);
    if (items.length === 0 || rows.length >= total) return rows;
  }
}

/** What RxNorm calls exactly this name, if anything; exact search, then the concept's term type. */
async function resolve(name: string): Promise<RxConcept | null> {
  const found = await (await fetch(`${RXNAV}/rxcui.json?name=${encodeURIComponent(name)}&search=0`)).json();
  const ids: string[] = found?.idGroup?.rxnormId ?? [];
  for (const id of ids) {
    const properties = (await (await fetch(`${RXNAV}/rxcui/${id}/properties.json`)).json())?.properties;
    if (properties?.name && properties?.tty) {
      const concept = { rxcui: id, name: properties.name as string, tty: properties.tty as string };
      if (concept.tty === 'IN') return concept;
      if (ids.length === 1) return concept;
    }
    // RxNav allows about 20 requests a second.
    await new Promise((done) => setTimeout(done, 60));
  }
  return null;
}

async function main() {
  const file = option('--file');
  let rows: ProductRow[];
  let dataset: string;
  if (file) {
    rows = itemsOf(JSON.parse(readFileSync(file, 'utf8')));
    dataset = `file: ${file}`;
  } else if (args.includes('--fetch')) {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) throw new Error('Set DATA_GO_KR_KEY to the data.go.kr service key.');
    const url = option('--url') ?? DEFAULT_URL;
    rows = await fetchRows(url, key);
    dataset = url.replace(/^https?:\/\//, '');
  } else {
    throw new Error('Say where the rows come from: --fetch, or --file saved-response.json.');
  }
  if (rows.length > 0 && !(fields.ko in rows[0] && fields.en in rows[0])) {
    throw new Error(
      `The rows have no ${fields.ko} / ${fields.en} fields; they have: ${Object.keys(rows[0]).join(', ')}. ` +
        'Name the right ones with --ko-field and --en-field.'
    );
  }

  const { pairs, combinations, unreadable } = extractPairs(rows, fields);
  const { names, conflicts } = agreeNames(pairs);
  console.log(`${rows.length} products: ${pairs.length} single-ingredient, ${combinations} combinations, ${unreadable} unreadable`);
  console.log(`${names.size} distinct ingredient names agreed, ${conflicts.length} spelled more than one way (left out)`);

  const { table, notIngredient, unmatched } = await matchRxNorm(names, resolve);
  console.log(`${table.length} matched an RxNorm ingredient exactly`);
  console.log(`${notIngredient.length} matched something else in RxNorm, e.g. a salt (left out)`);
  console.log(`${unmatched.length} not in RxNorm by that exact name (left out)`);
  for (const conflict of conflicts.slice(0, 20)) console.log(`  conflict: ${conflict.en}: ${conflict.ko.join(' / ')}`);

  if (args.includes('--dry-run')) return;
  const source = { dataset, retrieved: new Date().toISOString().slice(0, 10), rows: rows.length };
  writeFileSync(OUT, tableModule(table, source), 'utf8');
  console.log(`Written: ${OUT.pathname}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
