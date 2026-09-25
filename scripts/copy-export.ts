import type { PendingCopy } from '../src/i18n/pending.ts';
import { COPY_CONTEXT, SECTIONS, type CopyContext } from './copy-context.ts';

/**
 * The translation batch as a spreadsheet: one row per string awaiting Korean,
 * with where it appears and when, in the order `copy-context` gives — the
 * strings on screen today first. For a translator who will not have the app
 * in front of her.
 *
 * CSV, so it opens in Excel, Numbers or Google Sheets; with a byte-order mark,
 * or Excel shows the Korean in the notes as mojibake.
 */
export const HEADER = [
  'No.',
  'Section',
  'Where it appears',
  'When it shows',
  'English',
  'Notes for the translation',
  'Korean',
  'Key (leave as it is)',
] as const;

export type ExportRow = { readonly copy: PendingCopy; readonly context: CopyContext };

/** Pending strings with no context: an export would leave her guessing at these. */
export function missingContext(pending: readonly PendingCopy[]): string[] {
  return pending.filter(({ key }) => !(key in COPY_CONTEXT)).map(({ key }) => key);
}

/** The rows, in export order. Context for strings no longer pending is ignored. */
export function exportRows(pending: readonly PendingCopy[]): ExportRow[] {
  const byKey = new Map(pending.map((copy) => [copy.key, copy]));
  const order = Object.keys(COPY_CONTEXT);
  return Object.entries(COPY_CONTEXT)
    .filter(([key]) => byKey.has(key))
    .map(([key, context]) => ({ copy: byKey.get(key)!, context }))
    .sort(
      (a, b) =>
        SECTIONS.indexOf(a.context.section) - SECTIONS.indexOf(b.context.section) ||
        order.indexOf(a.copy.key) - order.indexOf(b.copy.key)
    );
}

const cell = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

export function exportCsv(rows: readonly ExportRow[]): string {
  const lines = [
    HEADER.join(','),
    ...rows.map(({ copy, context }, index) =>
      [
        String(index + 1),
        context.section,
        context.where,
        context.when,
        copy.en,
        [copy.note, context.notes].filter(Boolean).join(' '),
        '',
        copy.key,
      ]
        .map(cell)
        .join(',')
    ),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
