import { Scope } from '../src/features/scope.ts';
import type { PendingCopy } from '../src/i18n/pending.ts';
import { COPY_CONTEXT, SECTIONS, type CopyContext } from './copy-context.ts';

/**
 * The translation batch as a spreadsheet: one row per string awaiting Korean,
 * or awaiting her review of the Korean completed by AI, with where it appears
 * and when, in the order `copy-context` gives — the
 * strings on screen today first. For a translator who will not have the app
 * in front of her.
 *
 * Beside the English, an unreviewed draft of the Korean
 * (`content-drafts/copy-batch.draft.json`, or the AI's Korean already on
 * screen), so her job is reading and
 * correcting rather than writing; blank, with the reason, for the safety
 * warnings she writes herself. Then a column for her final wording, and one
 * that says, once she has filled it in, whether she changed the draft.
 *
 * CSV, so it opens in Excel, Numbers or Google Sheets; with a byte-order mark,
 * or Excel shows the Korean as mojibake.
 */
export const HEADER = [
  'No.',
  'Section',
  'Where it appears',
  'When it shows',
  'English',
  'Notes for the translation',
  'Draft Korean (UNREVIEWED)',
  'Why no draft',
  'Her final Korean',
  'Changed?',
  'Key (leave as it is)',
] as const;

/** The drafts file: a draft (`ko`) or the reason there is none (`why`), per key. */
export type CopyDrafts = {
  readonly strings: Readonly<Record<string, { readonly ko?: string; readonly why?: string; readonly note?: string }>>;
};

export type ExportRow = { readonly copy: PendingCopy; readonly context: CopyContext };

/** Pending strings with no context: an export would leave her guessing at these. */
export function missingContext(pending: readonly PendingCopy[]): string[] {
  return pending.filter(({ key }) => !(key in COPY_CONTEXT)).map(({ key }) => key);
}

/**
 * Pending strings with neither a draft nor a reason for leaving it blank. Korean
 * completed by AI is its own draft.
 */
export function missingDrafts(pending: readonly PendingCopy[], drafts: CopyDrafts): string[] {
  return pending
    .filter(({ key, ko }) => {
      if (ko) return false;
      const entry = drafts.strings[key];
      return !entry || (!entry.ko?.trim() && !entry.why?.trim());
    })
    .map(({ key }) => key);
}

/**
 * The rows, in export order. Context for strings no longer pending is ignored,
 * and so are strings of a hidden feature (`heldBack`).
 */
export function exportRows(pending: readonly PendingCopy[], scope: typeof Scope = Scope): ExportRow[] {
  const byKey = new Map(pending.map((copy) => [copy.key, copy]));
  const order = Object.keys(COPY_CONTEXT);
  return Object.entries(COPY_CONTEXT)
    .filter(([key, context]) => byKey.has(key) && !(context.hiddenWith && !scope[context.hiddenWith]))
    .map(([key, context]) => ({ copy: byKey.get(key)!, context }))
    .sort(
      (a, b) =>
        SECTIONS.indexOf(a.context.section) - SECTIONS.indexOf(b.context.section) ||
        order.indexOf(a.copy.key) - order.indexOf(b.copy.key)
    );
}

/** One CSV cell: quoted when it holds a quote, a comma or a line break. */
/** Pending strings left out of the export because their feature is hidden. */
export function heldBack(pending: readonly PendingCopy[], scope: typeof Scope = Scope): string[] {
  return pending
    .filter(({ key }) => {
      const feature = COPY_CONTEXT[key]?.hiddenWith;
      return feature !== undefined && !scope[feature];
    })
    .map(({ key }) => key);
}

export const cell = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/**
 * The "Changed?" formula for one row: blank until her final is filled in,
 * then whether it kept the draft, changed it, or was written with no draft.
 */
export const changedFormula = (row: number, draft: string, final: string) =>
  `=IF(${final}${row}="","",IF(${draft}${row}="","written by her",IF(EXACT(${final}${row},${draft}${row}),"same as draft","CHANGED")))`;

/** Column letters, for the formula: draft G, final I. */
const changed = (row: number) => changedFormula(row, 'G', 'I');

/** Said of a draft that is the Korean completed by AI. */
export const AI_DRAFT = 'Completed by AI, and in the app as it is until she has reviewed it.';

export function exportCsv(rows: readonly ExportRow[], drafts: CopyDrafts): string {
  const lines = [
    HEADER.join(','),
    ...rows.map(({ copy, context }, index) => {
      const draft = drafts.strings[copy.key] ?? {};
      const ko = copy.ko ?? draft.ko;
      const about = copy.ko ? AI_DRAFT : draft.note;
      return [
        String(index + 1),
        context.section,
        context.where,
        context.when,
        copy.en,
        [copy.note, context.notes, about && `About the draft: ${about}`].filter(Boolean).join(' '),
        ko ?? '',
        ko ? '' : (draft.why ?? ''),
        '',
        // Row 1 is the header.
        changed(index + 2),
        copy.key,
      ]
        .map(cell)
        .join(',');
    }),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
