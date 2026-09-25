/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Strings } from '../../src/i18n/strings.ts';
import { firstScreenIn } from './first-screen.ts';

const node = (attributes: string) => `<node index="0" ${attributes} class="android.widget.TextView" />`;
const dump = (...nodes: string[]) =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">${nodes.join('')}</hierarchy>`;

test('finds the lock screen once it has been drawn', () => {
  const xml = dump(node(`text="${Strings.lock.title.ko}" content-desc=""`));
  assert.equal(firstScreenIn(xml), Strings.lock.title.ko);
});

test('finds the introduction on a fresh install', () => {
  const xml = dump(node(`text="${Strings.onboarding.welcomeTitle.ko}" content-desc=""`));
  assert.equal(firstScreenIn(xml), Strings.onboarding.welcomeTitle.ko);
});

test("finds the app's message in the system fingerprint prompt", () => {
  const xml = dump(`<node text="${Strings.lock.prompt.ko}" package="com.android.systemui" />`);
  assert.equal(firstScreenIn(xml), Strings.lock.prompt.ko);
});

test('finds a label given only as an accessibility description', () => {
  const xml = dump(node(`text="" content-desc="${Strings.pin.createTitle.ko}"`));
  assert.equal(firstScreenIn(xml), Strings.pin.createTitle.ko);
});

test('does not count a blank screen — the JavaScript never ran', () => {
  // What a development build shows when its dev server cannot be reached: the
  // app's own root view, alive, empty, and crash-free. Once reported as a pass.
  const xml = dump(
    '<node index="0" text="" class="android.widget.FrameLayout" package="com.togurt5.koreanmedassistant" content-desc="" />'
  );
  assert.equal(firstScreenIn(xml), null);
});
