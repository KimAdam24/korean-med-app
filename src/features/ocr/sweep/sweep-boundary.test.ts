/**
 * Run with: npm run test:unit
 *
 * Holds the sweep's privacy invariant structurally (docs/sweep-privacy.md):
 * the code that accumulates readings across frames can only ever be handed
 * text and geometry, because it cannot reach anything that holds a frame.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const HERE = import.meta.dirname;

/** Everything `merge.ts` imports, followed through this feature's own files. */
function importsOf(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  const specifiers = [...text.matchAll(/(?:from\s*|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g)].map(
    (match) => match[1]
  );
  return specifiers.flatMap((specifier) => {
    if (!specifier.startsWith('.')) return [specifier];
    const target = path.resolve(path.dirname(file), specifier);
    const resolved = target.endsWith('.ts') ? target : `${target}.ts`;
    return [resolved, ...importsOf(resolved, seen)];
  });
}

test('the merge cannot reach a camera, a capture or the native sweep view', () => {
  const reached = importsOf(path.join(HERE, 'merge.ts'));
  const forbidden = reached.filter((specifier) =>
    /expo-camera|features[\\/]capture|label-sweep|expo-file-system|react-native$/.test(specifier)
  );
  assert.deepEqual(forbidden, []);
  // And it does reach what it should: the pipeline it judges the result with.
  assert.ok(reached.some((specifier) => specifier.endsWith('interpret-lines.ts')));
});
