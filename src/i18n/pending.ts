import type { Bilingual } from './strings.ts';

export type PendingCopy = {
  /** Where it lives in `Strings`, e.g. `onboarding.welcomeTitle`. */
  readonly key: string;
  readonly en: string;
  readonly note?: string;
};

const isBilingual = (value: unknown): value is Bilingual =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Bilingual).ko === 'string' &&
  typeof (value as Bilingual).en === 'string';

/** Every string in the table, with its key path, in declaration order. */
export function allCopy(table: object, prefix = ''): { key: string; text: Bilingual }[] {
  return Object.entries(table).flatMap(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name;
    if (isBilingual(value)) return [{ key, text: value }];
    if (typeof value === 'object' && value !== null) return allCopy(value, key);
    return [];
  });
}

/** The translation batch: every English placeholder still waiting for its Korean. */
export function pendingCopy(table: object): PendingCopy[] {
  return allCopy(table)
    .filter(({ text }) => text.pendingKo)
    .map(({ key, text }) => (text.note ? { key, en: text.en, note: text.note } : { key, en: text.en }));
}

/** The batch as a Markdown table, for handing to the translator as-is. */
export function pendingCopyTable(table: object): string {
  const rows = pendingCopy(table);
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  return [
    `${rows.length} string(s) awaiting Korean.`,
    '',
    '| Key | English | Note | Korean |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| \`${row.key}\` | ${cell(row.en)} | ${cell(row.note ?? '')} | |`),
  ].join('\n');
}
