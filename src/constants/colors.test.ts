/**
 * Run with: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Colors } from './colors.ts';

/** WCAG 2.x relative luminance and contrast ratio. */
const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** CIE76 colour difference: about 2 is just noticeable; 10 or more, plainly different. */
const lab = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

type Palette = (typeof Colors)['light' | 'dark'];
type Key = keyof Palette;

/** [foreground, background, the ratio it must clear] */
const PAIRS: [Key, Key, number][] = [
  // Body and secondary text: the audience reads in poor light, so 7:1, not 4.5.
  ['text', 'page', 7],
  ['text', 'surface', 7],
  ['text', 'backgroundSelected', 7],
  ['textSecondary', 'page', 7],
  ['textSecondary', 'surface', 7],
  ['infoText', 'infoSurface', 7],
  ['warnText', 'warnSurface', 7],
  ['recessedText', 'recessed', 7],
  ['damagedMarkText', 'damagedMark', 7],
  // Button labels, links and caution text: 4.5.
  ['onPrimary', 'primary', 4.5],
  ['onPrimary', 'primaryPressed', 4.5],
  ['outline', 'page', 4.5],
  ['outline', 'surface', 4.5],
  ['outline', 'backgroundSelected', 4.5],
  ['warnAccent', 'surface', 4.5],
  ['warnAccent', 'backgroundSelected', 4.5],
  ['onInfoAccent', 'infoAccent', 4.5],
  ['onWarnAccent', 'warnAccent', 4.5],
  // What a finger has to find, and icons: 3.
  ['primary', 'page', 3],
  ['primary', 'surface', 3],
  ['border', 'page', 3],
  ['border', 'surface', 3],
  ['primaryIcon', 'page', 3],
  ['primaryIcon', 'surface', 3],
  ['infoAccent', 'infoSurface', 3],
  ['warnAccent', 'warnSurface', 3],
];

for (const mode of ['light', 'dark'] as const) {
  test(`${mode}: every pair clears its contrast`, () => {
    const palette: Palette = Colors[mode];
    const low = PAIRS.map(([fg, bg, floor]) => ({ fg, bg, floor, ratio: contrast(palette[fg], palette[bg]) }))
      .filter(({ ratio, floor }) => ratio < floor)
      .map(({ fg, bg, floor, ratio }) => `${fg} on ${bg}: ${ratio.toFixed(2)} < ${floor}`);
    assert.deepEqual(low, []);
  });

  test(`${mode}: a warning's amber is plainly apart from the page, the cards and the info tint`, () => {
    const palette: Palette = Colors[mode];
    // Today's distances, held: the design pass chose an accent that keeps them.
    assert.ok(deltaE(palette.warnSurface, palette.page) >= 8, 'warning tint vs page');
    assert.ok(deltaE(palette.warnSurface, palette.surface) >= 10, 'warning tint vs card');
    assert.ok(deltaE(palette.warnSurface, palette.infoSurface) >= 12, 'warning tint vs info tint');
  });
}

test('the amber is the same as before the design pass', () => {
  assert.deepEqual(
    [Colors.light.warnSurface, Colors.light.warnText, Colors.light.warnAccent, Colors.light.warnEdge],
    ['#FFF3E0', '#6B3A00', '#A34F00', '#EFC994']
  );
  assert.deepEqual(
    [Colors.dark.warnSurface, Colors.dark.warnText, Colors.dark.warnAccent, Colors.dark.warnEdge],
    ['#2E1D06', '#FFD7A3', '#E8912A', '#6A4613']
  );
});
