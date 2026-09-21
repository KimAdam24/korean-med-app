/**
 * Run with: npm run test:unit
 *
 * Guards the boundary between reviewed and unreviewed medical content.
 *
 * The drafts in `content-drafts/` live outside `src/` so Metro never bundles
 * them — the protection is structural rather than a matter of remembering. This
 * asserts nobody has undone that with a convenience import.
 *
 * It matters because the failure is silent. Unreviewed Korean dosing text
 * reaching a screen looks exactly like reviewed Korean dosing text, and the
 * person it misleads is the one who cannot check it.
 *
 * A broader check — "no Korean outside the string table" — was tried and
 * removed. Comments legitimately name 식약처, and the UTF-8 tests need Hangul
 * fixtures, so it produced an allowlist long enough that it guarded nothing.
 * A precise test that holds beats a broad one that gets amended away.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

test('nothing in the app imports the unreviewed content drafts', () => {
  // Matches real import and require statements rather than any mention of the
  // directory, so this file's own prose does not trip it.
  const importsDrafts = /(?:from\s*|require\(\s*)['"][^'"]*content-drafts[^'"]*['"]/;

  const offenders = [
    ...sourceFiles(path.join(ROOT, 'src')),
    ...sourceFiles(path.join(ROOT, 'modules')),
  ].filter((file) => importsDrafts.test(readFileSync(file, 'utf8')));

  assert.deepEqual(
    offenders.map((file) => path.relative(ROOT, file)),
    [],
    'unreviewed content drafts are reachable from the app'
  );
});
