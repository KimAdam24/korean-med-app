/**
 * Fetches what the replay reads, into data/ (gitignored). Each step keeps
 * what it has fetched and, run again, fetches only what is missing, so an
 * interrupted fetch is resumed by running it again. See README.md.
 *
 *     node --experimental-strip-types --no-warnings tools/label-scan/fetch.ts [step] [--top 200]
 *
 * Steps, in order (all of them where none is named): top, identify, lists,
 * clinical, products, labels. `--refresh` fetches a step's data again from
 * the start, for a new baseline.
 */
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { INDICATIONS_SECTION, clinicalDrug, sectionMarkup } from '../../src/features/drugs/approved-uses.ts';
import { identifyByName } from '../../src/features/drugs/identify-name.ts';

import {
  DAILYMED,
  DOCTYPES,
  FILES,
  RXNAV,
  readJson,
  readLabels,
  reduce,
  writeJson,
  type ClinicalDrugs,
  type Drug,
  type Entry,
  type Kind,
  type Lists,
  type Top,
} from './shared.ts';

const args = process.argv.slice(2);
const topAt = args.indexOf('--top');
const TOP = topAt === -1 ? 200 : Number(args[topAt + 1]);
const refresh = args.includes('--refresh');
const named = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--top');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A request, tried again after a pause where it fails: DailyMed is slow at times, and drops some. */
async function get(url: string, as: 'json' | 'text' = 'json', tries = 5): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'korean-med-app label scan' } });
      if (response.ok) return as === 'json' ? await response.json() : await response.text();
      if (response.status === 404) throw new Error(`404 ${url}`);
    } catch (error) {
      if (String(error).includes('404') || attempt >= tries) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await sleep(1500 * attempt);
  }
}

/** Runs `work` over `items`, `at` at a time, saving with `save` every so often. */
async function pool<T>(items: T[], at: number, work: (item: T) => Promise<void>, save: () => void) {
  let done = 0;
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await work(item);
      if (++done % 100 === 0) {
        save();
        console.log(`  ${done} of ${items.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: at }, worker));
  save();
}

/** Every page of a DailyMed list. */
async function list(query: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (let page = 1; ; page++) {
    const got = (await get(`${DAILYMED}/spls.json?${query}&pagesize=100&page=${page}`)) as {
      data?: { setid: string; title: string; spl_version?: number }[];
      metadata?: { total_pages?: number };
    };
    entries.push(...(got.data ?? []).map((entry) => ({ setid: entry.setid, title: entry.title, version: entry.spl_version ?? null })));
    if (page >= (got.metadata?.total_pages ?? 1)) return entries;
  }
}

const steps: Record<string, () => Promise<void>> = {
  /** ClinCalc DrugStats' Top 300, from MEPS: rank and name. */
  async top() {
    if (refresh || !existsSync(FILES.topPage)) {
      writeFileSync(FILES.topPage, (await get('https://clincalc.com/DrugStats/Top300Drugs.aspx', 'text')) as string);
    }
    const page = readFileSync(FILES.topPage, 'utf8');
    const year = /Top 300 of (\d{4})/.exec(page)?.[1];
    const top: Top = [...page.matchAll(/<tr[^>]*>\s*<td>(\d+)<\/td>\s*<td><a[^>]*>([^<]+)<\/a><\/td>/g)].map(([, rank, name]) => ({
      rank: Number(rank),
      name: name.replace(/&amp;/g, '&').trim(),
    }));
    if (top.length < TOP) throw new Error(`ClinCalc's page gave ${top.length} medicines; its layout may have changed`);
    writeJson(FILES.top, top);
    console.log(`top: ${top.length} medicines, ${year ?? 'year not found'}`);
  },

  /** Each of the top medicines identified as the app identifies a printed name (`identifyByName`). */
  async identify() {
    const top = readJson<Top>(FILES.top, []).slice(0, TOP);
    const drugs = refresh ? [] : readJson<Drug[]>(FILES.drugs, []);
    const known = new Set(drugs.filter((drug) => drug.status !== 'unavailable').map((drug) => drug.rank));
    const kept = drugs.filter((drug) => known.has(drug.rank));
    await pool(
      top.filter((one) => !known.has(one.rank)),
      2,
      async (one) => {
        const found = await identifyByName(one.name);
        kept.push(
          found.status === 'identified'
            ? { ...one, status: 'identified', rxcui: found.match.rxcui, ingredients: [...found.match.ingredients], matched: found.match.matched }
            : { ...one, status: found.status }
        );
      },
      () => writeJson(FILES.drugs, [...kept].sort((a, b) => a.rank - b.rank))
    );
    const identified = kept.filter((drug) => drug.status === 'identified').length;
    console.log(`identify: ${identified} of ${top.length} identified; not: ${kept.filter((drug) => drug.status !== 'identified').map((drug) => drug.name).join(', ')}`);
  },

  /** DailyMed's list for each medicine's RxNorm code, every page, prescription and over the counter. */
  async lists() {
    const drugs = readJson<Drug[]>(FILES.drugs, []).filter((drug) => drug.status === 'identified');
    const lists = refresh ? {} : readJson<Lists>(FILES.lists, {});
    const jobs = drugs.flatMap((drug) => (['prescription', 'otc'] as Kind[]).filter((kind) => !lists[drug.rxcui!]?.[kind]).map((kind) => [drug.rxcui!, kind] as const));
    await pool(
      jobs,
      4,
      async ([rxcui, kind]) => {
        const entries = await list(`rxcui=${rxcui}&doctype=${DOCTYPES[kind]}`);
        lists[rxcui] = { ...lists[rxcui], [kind]: entries };
      },
      () => writeJson(FILES.lists, lists)
    );
    console.log(`lists: ${Object.values(lists).reduce((n, byKind) => n + (byKind.prescription?.length ?? 0) + (byKind.otc?.length ?? 0), 0)} entries`);
  },

  /** RxNav's clinical drugs (SCD) for each medicine. */
  async clinical() {
    const drugs = readJson<Drug[]>(FILES.drugs, []).filter((drug) => drug.status === 'identified');
    const clinical = refresh ? {} : readJson<ClinicalDrugs>(FILES.clinicalDrugs, {});
    await pool(
      drugs.filter((drug) => !clinical[drug.rxcui!]),
      2,
      async (drug) => {
        const got = (await get(`${RXNAV}/rxcui/${drug.rxcui}/related.json?tty=SCD`)) as {
          relatedGroup?: { conceptGroup?: { tty?: string; conceptProperties?: { rxcui: string; name: string }[] }[] };
        };
        clinical[drug.rxcui!] = (got.relatedGroup?.conceptGroup ?? [])
          .filter((group) => group.tty === 'SCD')
          .flatMap((group) => group.conceptProperties ?? [])
          .map((concept) => ({ rxcui: concept.rxcui, name: concept.name }));
        await sleep(100);
      },
      () => writeJson(FILES.clinicalDrugs, clinical)
    );
    console.log(`clinical: ${Object.values(clinical).reduce((n, drugs) => n + drugs.length, 0)} clinical drugs`);
  },

  /** DailyMed's list for each tablet or capsule clinical drug of as many ingredients, of each kind its medicine has. */
  async products() {
    const drugs = readJson<Drug[]>(FILES.drugs, []).filter((drug) => drug.status === 'identified');
    const lists = readJson<Lists>(FILES.lists, {});
    const clinical = readJson<ClinicalDrugs>(FILES.clinicalDrugs, {});
    const products = refresh ? {} : readJson<Lists>(FILES.productLists, {});
    const jobs = drugs.flatMap((drug) =>
      (clinical[drug.rxcui!] ?? [])
        .filter((concept) => clinicalDrug(concept.name)?.ingredients === drug.ingredients!.length)
        .flatMap((concept) =>
          (['prescription', 'otc'] as Kind[])
            .filter((kind) => (lists[drug.rxcui!]?.[kind]?.length ?? 0) > 0 && !products[concept.rxcui]?.[kind])
            .map((kind) => [concept.rxcui, kind] as const)
        )
    );
    await pool(
      jobs,
      4,
      async ([rxcui, kind]) => {
        const entries = await list(`rxcui=${rxcui}&doctype=${DOCTYPES[kind]}`);
        products[rxcui] = { ...products[rxcui], [kind]: entries };
      },
      () => writeJson(FILES.productLists, products)
    );
    console.log(`products: ${Object.keys(products).length} clinical drugs listed`);
  },

  /** Every label of those lists titled a tablet or capsule, kept small (`reduce`), one per line. */
  async labels() {
    if (refresh) rmSync(FILES.labels, { force: true });
    const lists = readJson<Lists>(FILES.lists, {});
    const products = readJson<Lists>(FILES.productLists, {});
    const have = new Set((await readLabels()).keys());
    const wanted = new Map<string, string>();
    for (const byKind of [...Object.values(lists), ...Object.values(products)]) {
      for (const entry of [...(byKind.prescription ?? []), ...(byKind.otc ?? [])]) {
        if (/TABLET|CAPSULE/i.test(entry.title) && !have.has(entry.setid)) wanted.set(entry.setid, entry.title);
      }
    }
    console.log(`labels: ${wanted.size} to fetch, ${have.size} kept`);
    const failed: string[] = [];
    await pool(
      [...wanted],
      6,
      async ([setid, title]) => {
        try {
          const xml = (await get(`${DAILYMED}/spls/${setid}.xml`, 'text')) as string;
          appendFileSync(FILES.labels, `${JSON.stringify({ setid, title, xml: reduce(xml, sectionMarkup(xml, INDICATIONS_SECTION)) })}\n`);
        } catch {
          failed.push(setid);
        }
      },
      () => {}
    );
    console.log(`labels: done; ${failed.length} failed${failed.length ? ` (run again to retry): ${failed.slice(0, 10).join(', ')}` : ''}`);
  },
};

const order = ['top', 'identify', 'lists', 'clinical', 'products', 'labels'];
for (const step of named ? [named] : order) {
  if (!steps[step]) throw new Error(`no step "${step}"; the steps are ${order.join(', ')}`);
  console.log(`== ${step}`);
  await steps[step]();
}
