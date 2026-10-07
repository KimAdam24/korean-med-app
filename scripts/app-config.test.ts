/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')) as {
  expo: { android?: { allowBackup?: boolean } };
};

test('backups are off: said in so many words, since Android backs up an app that does not say', () => {
  // A backup would hold the vault, unreadable without its key (which never
  // leaves the phone), and restore as a vault that cannot be opened. Decided
  // twice and never applied until 2026-10-07; check-release.py checks the
  // built APK too.
  assert.equal(app.expo.android?.allowBackup, false);
});
