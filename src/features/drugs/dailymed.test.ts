/**
 * Run with: npm run test:unit
 *
 * Only `extractSectionText` is covered: the fetch wrappers are thin and would
 * test the network rather than this code. The markup below follows the shape of
 * a real SPL document, which is where the awkward parts are.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LABEL_SECTIONS, extractSectionText } from './dailymed.ts';

const BOXED = LABEL_SECTIONS.boxedWarning;

test('extracts the section carrying the code', () => {
  const xml = `
    <section><code code="48780-1" displayName="SPL product data elements"/>
      <text><paragraph>Not this one.</paragraph></text>
    </section>
    <section><code code="${BOXED}" displayName="Boxed Warning section"/>
      <text><paragraph>Not for weight loss.</paragraph></text>
    </section>`;
  assert.equal(extractSectionText(xml, BOXED), 'Not for weight loss.');
});

test('returns null when the label has no such section', () => {
  // Ordinary: most drugs carry no boxed warning at all.
  const xml = `<section><code code="48780-1"/><text><paragraph>Other.</paragraph></text></section>`;
  assert.equal(extractSectionText(xml, BOXED), null);
});

test('handles nested text elements without truncating', () => {
  // The reason this counts depth instead of matching to the first closer.
  const xml = `<section><code code="${BOXED}"/>
    <text>
      <paragraph>Outer warning.</paragraph>
      <list><item><text>Inner detail.</text></item></list>
      <paragraph>Final line.</paragraph>
    </text></section>`;

  const result = extractSectionText(xml, BOXED);
  assert.ok(result?.includes('Outer warning.'));
  assert.ok(result?.includes('Inner detail.'));
  // Stopping at the first </text> would have lost this.
  assert.ok(result?.includes('Final line.'));
});

test('keeps list items on separate lines', () => {
  // Four risks run together into one sentence is a change of meaning, not
  // just of formatting.
  const xml = `<section><code code="${BOXED}"/><text>
    <list><item>Risk one</item><item>Risk two</item></list>
  </text></section>`;

  const result = extractSectionText(xml, BOXED);
  assert.ok(result?.includes('• Risk one'));
  assert.ok(result?.includes('• Risk two'));
  assert.equal(result?.split('\n').length, 2);
});

test('decodes entities and strips attributes', () => {
  const xml = `<section><code code="${BOXED}"/><text>
    <paragraph styleCode="bold">Risk of &amp; serious &lt;harm&gt;</paragraph>
  </text></section>`;
  assert.equal(extractSectionText(xml, BOXED), 'Risk of & serious <harm>');
});

test('returns null for a section whose text is empty', () => {
  const xml = `<section><code code="${BOXED}"/><text>   </text></section>`;
  assert.equal(extractSectionText(xml, BOXED), null);
});

test('returns null rather than guessing when the markup is truncated', () => {
  // A partial download must not yield half a warning presented as a whole one.
  const xml = `<section><code code="${BOXED}"/><text><paragraph>Cut off here`;
  assert.equal(extractSectionText(xml, BOXED), null);
});
