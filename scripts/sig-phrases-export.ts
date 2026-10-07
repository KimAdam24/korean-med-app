import { cell, changedFormula } from './copy-export.ts';

/**
 * The dosing-phrase draft (`content-drafts/sig-phrases.draft.md`) as a sheet
 * for review, in the copy batch's shape: English, the draft Korean, a column
 * for the reviewer's final wording, and whether the reviewer changed it. Read from the draft
 * itself, so there is one source and nothing to drift.
 *
 * The same gate as the copy batch: a row reaches the app only once the reviewer has
 * signed it off, transcribed into `src/features/directions/approved-phrases.ts`
 * with the review record in the commit.
 *
 * Rows whose English states a limit that could be read as a schedule come
 * first, with a plain warning (see `WARNINGS`).
 */

export type PhraseRow = {
  /** The draft's ID (`F13`); the worked examples of how phrases join are `K1`, `K2`. */
  readonly id: string;
  readonly section: string;
  readonly en: string;
  /** Empty when the draft leaves the words out (`*(omit)*`). */
  readonly ko: string;
  readonly notes: string;
};

/** What the draft says about a section as a whole, carried onto each of its rows. */
const SECTION_NOTES: Readonly<Record<string, string>> = {
  Quantity:
    'Korean counts pills with 알 and capsules with 캡슐. For numbers above three, the draft proposes digits (4알) rather than native numerals, for reading at a glance: please confirm.',
  Route:
    'Open question: Korean usually leaves "by mouth" unsaid, but the user may be holding medicines that are not taken by mouth. R1 says it (입으로); R2 leaves it out. Approve one of the two, not both.',
  Composition:
    'How phrases join: frequency first, then conditions, then the dose, the reverse of the English. The draft split the second example into two sentences because the English did: would one sentence be better?',
};

/**
 * Plain warnings for the limit-that-reads-like-a-schedule rows: an as-needed
 * medicine taken on a schedule is an overdose, arrived at by following the app.
 */
export const WARNINGS: Readonly<Record<string, string>> = {
  F13:
    'READ THIS ROW FIRST. This is a limit, not a schedule. "Up to 3 times daily" means no more than three times in a day, and only when needed; fewer times, or none, is fine. If the Korean can be read as "three times a day", it tells someone to take an as-needed medicine three times every day: triple an as-needed dose. This was on the first real label tested, so it is not hypothetical. The draft is not sure 까지 carries the limit clearly enough for a tired reader; an added "그보다 더 드시면 안 돼요" (do not take more than that) is one option.',
  K2:
    'The same limit as F13, inside the whole sentence from the first real label tested. Please check that the sentence as a whole still reads as "no more than three times a day, and only when needed".',
  C6:
    'This is what turns a frequency into a limit: "twice daily as needed" means at most twice a day, and only when needed (the same for every frequency, F1 to F13). If the Korean loses the sense of "only when needed", the frequency beside it reads as a schedule.',
  C7:
    'As C6: "as needed for pain" turns the frequency beside it into a limit. If the Korean loses "only when", the frequency reads as a schedule.',
};

const FIRST = ['F13', 'K2', 'C6', 'C7'];

/** Reads the draft's tables and worked examples. */
export function parseSigDraft(markdown: string): PhraseRow[] {
  const rows: PhraseRow[] = [];
  let section = '';
  let pendingEn: string | null = null;
  let examples = 0;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^## \d+\. (.+)$/.exec(line);
    if (heading) {
      section = heading[1].replace(/ and timing$/, '');
      continue;
    }
    if (/^## /.test(line)) {
      section = '';
      continue;
    }
    if (!section) continue;

    const cells = line.trim().startsWith('|') ? line.trim().split('|').slice(1, -1).map((part) => part.trim()) : [];
    if (cells.length === 4 && /^[QRFC]\d+$/.test(cells[0])) {
      const [id, en, ko, notes] = cells;
      const omitted = /^\*\(omit\)\*$/.test(ko.trim());
      rows.push({
        id,
        section,
        // "BY MOUTH (oral, implied)": the English matched is "BY MOUTH".
        en: en.replace(/\s*\(oral, implied\)$/, '').trim(),
        ko: omitted ? '' : ko.trim(),
        notes: [omitted ? 'The draft leaves the words out entirely.' : '', notes.replace(/\*\*/g, '').trim()]
          .filter(Boolean)
          .join(' '),
      });
      continue;
    }

    // Worked examples of composition: "> `ENGLISH`" then "> → `KOREAN`".
    const quoted = /^> (→ )?`(.+)`\s*$/.exec(line);
    if (section === 'Composition' && quoted) {
      if (!quoted[1]) {
        pendingEn = quoted[2];
      } else if (pendingEn) {
        examples += 1;
        rows.push({ id: `K${examples}`, section, en: pendingEn, ko: quoted[2], notes: '' });
        pendingEn = null;
      }
    }
  }
  return rows;
}

/** The limit rows first, in order of danger; then the draft's own order. */
export function sheetOrder(rows: readonly PhraseRow[]): PhraseRow[] {
  const first = FIRST.map((id) => rows.find((row) => row.id === id)).filter((row): row is PhraseRow => !!row);
  return [...first, ...rows.filter((row) => !FIRST.includes(row.id))];
}

export const HEADER = [
  'No.',
  'Warning',
  'Section',
  'Where it appears',
  'When it shows',
  'English',
  'Notes for the translation',
  'Draft Korean (UNREVIEWED)',
  'Why no draft',
  "Reviewer's final Korean",
  'Changed?',
  'ID (leave as it is)',
] as const;

const CONFIDENCE =
  'In the notes, "?" means the drafter was unsure (expect to rewrite), and "??" that it may be wrong or dangerous to phrase this way.';

export function phrasesCsv(rows: readonly PhraseRow[]): string {
  const lines = [
    HEADER.join(','),
    ...sheetOrder(rows).map((row, index) => {
      const composition = row.section === 'Composition';
      const notes = [
        row.notes,
        SECTION_NOTES[row.section],
        /\?/.test(row.notes) ? CONFIDENCE : '',
        row.id === 'R2' ? 'If you agree, write [leave out] in your final column.' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return [
        String(index + 1),
        WARNINGS[row.id] ?? '',
        row.section,
        composition
          ? 'How the phrases join into one Korean sentence: their order, the comma, the ending.'
          : 'Under the directions, on the result screen and on a medicine\'s page, as part of a Korean sentence made from these phrases.',
        composition
          ? 'Every Korean direction, once approved.'
          : 'Once approved, whenever a direction is made entirely of approved phrases. Not yet: nothing is approved.',
        row.en,
        notes,
        row.ko || (row.id === 'R2' ? '[leave out]' : ''),
        row.ko || row.id === 'R2' ? '' : 'No draft in the source.',
        '',
        // Row 1 is the header; draft in H, the reviewer's final in J.
        changedFormula(index + 2, 'H', 'J'),
        row.id,
      ]
        .map(cell)
        .join(',');
    }),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
