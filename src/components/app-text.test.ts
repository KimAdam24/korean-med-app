/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'build' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

test("no screen draws text in the phone's own font, at a weight Bold text cannot reach", () => {
  // React Native's Text and TextInput, imported anywhere but app-text, would
  // be drawn in the system font at exactly their style's weight.
  const importsNative = /import\s*\{[^}]*\b(Text|TextInput)\b[^}]*\}\s*from\s*'react-native'/;
  const offenders = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'modules'))]
    .map((path) => relative(ROOT, path).replace(/\\/g, '/'))
    .filter((path) => path !== 'src/components/app-text.tsx')
    .filter((path) => importsNative.test(readFileSync(join(ROOT, path), 'utf8')));
  assert.deepEqual(offenders, []);
});
