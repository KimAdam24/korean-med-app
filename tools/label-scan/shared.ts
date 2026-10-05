/**
 * What the label scan's steps share: where the data is, how a label is kept
 * and read, the bottles the replay looks up, and DailyMed and RxNav as the
 * fetch read them. See README.md.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { CARRIER_SALTS, SALT_WORDS, strengthOf, type Strength } from '../../src/features/drugs/identify-name.ts';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA = resolve(HERE, 'data');
export const REPO = resolve(HERE, '../..');
mkdirSync(DATA, { recursive: true });

export const DAILYMED = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';
export const RXNAV = 'https://rxnav.nlm.nih.gov/REST';
export const DOCTYPES = { prescription: '34391-3', otc: '34390-5' } as const;
export type Kind = keyof typeof DOCTYPES;

// --- The data files ----------------------------------------------------------

export const FILES = {
  /** ClinCalc's page, as fetched. */
  topPage: resolve(DATA, 'top300.html'),
  /** The top medicines: rank and ClinCalc's name. */
  top: resolve(DATA, 'top.json'),
  /** Each identified as the app identifies a printed name. */
  drugs: resolve(DATA, 'drugs.json'),
  /** DailyMed's list for each medicine's RxNorm code, every page, by kind. */
  lists: resolve(DATA, 'lists.json'),
  /** RxNav's clinical drugs (SCD) for each medicine. */
  clinicalDrugs: resolve(DATA, 'clinical-drugs.json'),
  /** DailyMed's list for each tablet or capsule clinical drug, by kind. */
  productLists: resolve(DATA, 'product-lists.json'),
  /** Every label of those lists titled a tablet or capsule, kept as `reduce` keeps it: one JSON per line. */
  labels: resolve(DATA, 'labels.jsonl'),
} as const;

export type Top = { rank: number; name: string }[];
export type Drug = { rank: number; name: string; status: 'identified' | 'unidentified' | 'unavailable'; rxcui?: string; ingredients?: string[]; matched?: string };
export type Entry = { setid: string; title: string; version: number | null };
/** By RxNorm code, then kind. */
export type Lists = Record<string, Partial<Record<Kind, Entry[]>>>;
export type ClinicalDrugs = Record<string, { rxcui: string; name: string }[]>;
export type Label = { setid: string; title: string; xml: string };

export const readJson = <T>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback);
export const writeJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));

export async function readLabels(): Promise<Map<string, Label>> {
  const labels = new Map<string, Label>();
  if (!existsSync(FILES.labels)) return labels;
  for await (const line of createInterface({ input: createReadStream(FILES.labels, 'utf8'), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const label = JSON.parse(line) as Label;
    labels.set(label.setid, label);
  }
  return labels;
}

// --- A label, kept small -----------------------------------------------------

/**
 * A label's XML with only what the lookup reads of it: the document's own
 * code (its kind), its approvals, its products (each `<subject>`, with their
 * forms, ingredients, strengths, routes and codes) and its Indications and
 * Usage section, as they are. The rest (hundreds of kilobytes of warnings,
 * studies, tables) is dropped. `readIndications` reads this as it reads the
 * whole: so any version of it can be replayed on what was fetched.
 */
export function reduce(xml: string, indications: string | null): string {
  const kind = /<document\b[^>]*>[\s\S]*?(<code\b[^>]*>)/.exec(xml)?.[1] ?? '';
  const approvals = [...xml.matchAll(/<approval\b[^>]*>[\s\S]*?<\/approval>/g)].map(([approval]) => `<subjectOf>${approval}</subjectOf>`);
  const subjects = [...xml.matchAll(/<subject>[\s\S]*?<\/subject>/g)].map(([subject]) => subject);
  return `<document>${kind}${approvals.join('')}${subjects.join('')}${indications ? `<component>${indications}</component>` : ''}</document>`;
}

export type Active = { substance: string; moiety: string | null; strength: Strength | null };
export type Product = { form: string; routes: string[]; actives: Active[] };

/** Each product of a label, as its `<subject>` gives it: the replay's own reading, apart from the app's. */
export function productsOf(xml: string): Product[] {
  const attribute = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
  return [...xml.matchAll(/<subject>([\s\S]*?)<\/subject>/g)].map(([, body]) => ({
    form: (/<formCode\b[^>]*displayName="([^"]+)"/.exec(body)?.[1] ?? '').toUpperCase(),
    routes: [...new Set([...body.matchAll(/<routeCode\b[^>]*displayName="([^"]+)"/g)].map(([, route]) => route.toUpperCase()))],
    actives: [...body.matchAll(/<ingredient\s+classCode="ACTI[BMR]"[^>]*>([\s\S]*?)<\/ingredient>/g)].map(([, ingredient]) => {
      const numerator = /<numerator\b([^>]*)>/.exec(ingredient)?.[1] ?? '';
      const denominator = /<denominator\b([^>]*)>/.exec(ingredient)?.[1] ?? '';
      const perUnit = attribute(denominator, 'unit') === '1' && attribute(denominator, 'value') === '1';
      return {
        substance: (/<name>([^<]+)<\/name>/.exec(ingredient)?.[1] ?? '').trim().toUpperCase(),
        moiety: /<activeMoiety>\s*<activeMoiety>[\s\S]*?<name>([^<]+)<\/name>/.exec(ingredient)?.[1].trim().toUpperCase() ?? null,
        strength: perUnit ? strengthOf(Number(attribute(numerator, 'value')), attribute(numerator, 'unit') ?? '') : null,
      };
    }),
  }));
}

export const APPROVED = /^(NDA|ANDA|BLA|NDA AUTHORIZED GENERIC)$/i;
export const approvalsOf = (xml: string) =>
  [...xml.matchAll(/<approval\b[^>]*>([\s\S]*?)<\/approval>/g)].map(([, body]) => /<code\b[^>]*displayName="([^"]+)"/.exec(body)?.[1].trim() ?? '');

// --- The bottles ---------------------------------------------------------------

const words = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0 && word !== 'usp');
const BY_MOUTH = new Set(['ORAL', 'SUBLINGUAL', 'BUCCAL']);
export const strengthsKey = (strengths: readonly Strength[]) =>
  strengths.map((s) => `${+s.value.toFixed(4)} ${s.unit}`).sort().join(' + ');

/**
 * Whether a product is of the medicine, by the replay's own measure, apart
 * from the app's: each active named by an ingredient's words, salts and water
 * aside, by its substance or its moiety. Lenient on purpose: the bottles are
 * every product that could be the medicine, and the app's rules decide.
 */
function isOf(actives: readonly Active[], ingredients: readonly string[]): boolean {
  const moieties = new Map(actives.map((active) => [active.moiety ?? active.substance, active]));
  if (moieties.size !== ingredients.length) return false;
  const bare = (name: string) => words(name).filter((word) => !SALT_WORDS.has(word) && !CARRIER_SALTS.has(word) && !/hydrate$|^anhydrous$/.test(word)).join(' ');
  return ingredients.every((ingredient) =>
    [...moieties.values()].some((active) => bare(active.substance) === bare(ingredient) || (active.moiety !== null && bare(active.moiety) === bare(ingredient)))
  );
}

/**
 * A pharmacy bottle of one product, read cleanly: its generic name and salt,
 * strength and form, its release marker where it has one (as its labels'
 * titles carry it, else ER or DR), its brand only where every label of the
 * product is a brand's (it is then sold under that brand alone), and
 * prescription unless it is made over the counter only.
 */
export type Bottle = {
  readonly drug: string;
  readonly kind: Kind;
  readonly form: 'TABLET' | 'CAPSULE';
  readonly release: 'extended' | 'delayed' | null;
  readonly token: string | null;
  readonly salts: readonly string[];
  readonly strengths: readonly Strength[];
  readonly brand: readonly string[];
  /** How many of the medicine's labels are of it: the most is its most common bottle. */
  readonly labels: number;
};

/** The release a label's own text first says its product is, where its form says none. */
const textRelease = (xml: string) => {
  const text = (/<section\b[\s\S]*?code="34067-9"[\s\S]*?<\/section>/.exec(xml)?.[0] ?? '').replace(/<[^>]+>/g, ' ');
  const first = text.replace(/\s+/g, ' ').trim().split(/(?<=[.:])\s/, 1)[0].slice(0, 400);
  return /\b(?:extended|sustained|controlled|prolonged)[- ]release\b/i.test(first) ? 'extended' : /\b(?:delayed[- ]release|enteric[- ]coated)\b/i.test(first) ? 'delayed' : null;
};

export function bottlesOf(drug: Drug, lists: Lists, labels: Map<string, Label>): Bottle[] {
  const own = new Set(drug.ingredients!.flatMap(words));
  type Gathered = { bottle: Omit<Bottle, 'token' | 'brand' | 'labels'>; count: number; branded: number; brands: Map<string, number>; tokens: Map<string, number> };
  const byKey = new Map<string, Gathered>();
  for (const kind of ['prescription', 'otc'] as const) {
    for (const entry of lists[drug.rxcui!]?.[kind] ?? []) {
      const label = labels.get(entry.setid);
      if (!label) continue;
      const approvals = approvalsOf(label.xml);
      if (!(approvals.length > 0 && approvals.every((approval) => APPROVED.test(approval)))) continue;
      if (!label.xml.includes('code="34067-9"')) continue;
      const title = entry.title.replace(/\[.*$/, '');
      // A brand: the words before the first bracket that are not the medicine's, its salts or its form.
      const brand = words(title.replace(/\(.*$/, '')).filter(
        (word) => !own.has(word) && !SALT_WORDS.has(word) && !/^(tablet|tablets|capsule|capsules|film|coated|extended|release|delayed|chewable|orally|disintegrating|liquid|filled|gelatin|sugar|oral|er|xr|xl|sr|cr|la|cd|dr|ec|odt|hcl|and|usp)$/.test(word) && !/^\d/.test(word)
      );
      const tokens = [...new Set([...entry.title.toUpperCase().matchAll(/\b(XL|SR|XR|CR|LA|CD)\b/g)].map(([token]) => token.toLowerCase()))];
      const seen = new Set<string>();
      for (const product of productsOf(label.xml)) {
        const form = /CAPSULE/.test(product.form) ? 'CAPSULE' : /TABLET/.test(product.form) ? 'TABLET' : null;
        if (!form || (product.routes.length > 0 && !product.routes.some((route) => BY_MOUTH.has(route)))) continue;
        if (!isOf(product.actives, drug.ingredients!)) continue;
        const strengths = product.actives.map((active) => active.strength).filter((strength): strength is Strength => strength !== null);
        if (strengths.length === 0) continue;
        const release = /EXTENDED/.test(product.form) ? 'extended' : /DELAYED/.test(product.form) ? 'delayed' : textRelease(label.xml);
        const salts = [...new Set(product.actives.flatMap((active) => words(active.substance)).filter((word) => (CARRIER_SALTS.has(word) || SALT_WORDS.has(word)) && !own.has(word) && !/hydrate$|^anhydrous$/.test(word)))].sort();
        const key = `${kind}|${form}|${release}|${strengthsKey(strengths)}|${salts.join(' ')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const gathered = byKey.get(key) ?? { bottle: { drug: drug.name, kind, form, release, salts, strengths }, count: 0, branded: 0, brands: new Map(), tokens: new Map() };
        gathered.count++;
        if (brand.length > 0) {
          gathered.branded++;
          gathered.brands.set(brand.join(' '), (gathered.brands.get(brand.join(' ')) ?? 0) + 1);
        }
        if (tokens.length === 1) gathered.tokens.set(tokens[0], (gathered.tokens.get(tokens[0]) ?? 0) + 1);
        byKey.set(key, gathered);
      }
    }
  }
  const bottles = [...byKey.values()].map(({ bottle, count, branded, brands, tokens }): Bottle => {
    const [token, carried] = [...tokens].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return {
      ...bottle,
      token: bottle.release === 'extended' && token && carried * 2 >= count ? token : null,
      brand: branded === count ? [...brands].sort((a, b) => b[1] - a[1])[0][0].split(' ') : [],
      labels: count,
    };
  });
  // Over the counter only where it is not made on prescription too.
  const kept = bottles.filter(
    (bottle) =>
      bottle.kind === 'prescription' ||
      !bottles.some((other) => other.kind === 'prescription' && other.form === bottle.form && other.release === bottle.release && strengthsKey(other.strengths) === strengthsKey(bottle.strengths))
  );
  return kept.sort((a, b) => b.labels - a.labels);
}

// --- DailyMed and RxNav, as fetched ------------------------------------------

export type Asked = { lists: number; packaging: number; labels: number; rxnav: number };

/**
 * `fetch` answered from the fetched data, as DailyMed and RxNav answered it:
 * lists a hundred to a page, with their page count; each label's kept XML;
 * its packaging, from its products' strengths (`productsOf`), DailyMed's own
 * not having been fetched; RxNav's clinical drugs. Anything else is a 404.
 * Counts what it is asked, per kind of request.
 */
export function stand(data: { lists: Lists; productLists: Lists; clinicalDrugs: ClinicalDrugs; labels: Map<string, Label> }) {
  const asked: Asked = { lists: 0, packaging: 0, labels: 0, rxnav: 0 };
  const reply = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }) as Response;
  const fetcher = (async (input: string | URL) => {
    const url = decodeURIComponent(String(input));
    const clinical = /\/rxcui\/(\d+)\/related\.json\?tty=SCD/.exec(url);
    if (clinical) {
      asked.rxnav++;
      const drugs = data.clinicalDrugs[clinical[1]];
      return drugs ? reply({ relatedGroup: { conceptGroup: [{ tty: 'SCD', conceptProperties: drugs }] } }) : reply({}, 404);
    }
    const listing = /\/spls\.json\?rxcui=(\d+)&doctype=([\d-]+)/.exec(url);
    if (listing) {
      asked.lists++;
      const kind: Kind = listing[2] === DOCTYPES.otc ? 'otc' : 'prescription';
      const all = (data.lists[listing[1]] ?? data.productLists[listing[1]])?.[kind] ?? [];
      const page = Number(/&page=(\d+)/.exec(url)?.[1] ?? 1);
      return reply({
        data: all.slice((page - 1) * 100, page * 100).map((entry) => ({ setid: entry.setid, title: entry.title, spl_version: entry.version })),
        metadata: { total_pages: Math.max(1, Math.ceil(all.length / 100)) },
      });
    }
    const packaging = /\/spls\/([0-9a-f-]+)\/packaging\.json/.exec(url);
    if (packaging) {
      asked.packaging++;
      const label = data.labels.get(packaging[1]);
      if (!label) return reply({}, 404);
      const strengths = productsOf(label.xml).flatMap((product) =>
        product.actives.filter((active) => active.strength).map((active) => ({ strength: `${active.strength!.value} ${active.strength!.unit}` }))
      );
      return reply({ data: { products: [{ active_ingredients: strengths }] } });
    }
    const xml = /\/spls\/([0-9a-f-]+)\.xml/.exec(url);
    if (xml) {
      asked.labels++;
      const label = data.labels.get(xml[1]);
      return label ? reply(label.xml) : reply('', 404);
    }
    return reply({}, 404);
  }) as typeof fetch;
  return { fetcher, asked };
}
