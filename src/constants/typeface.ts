/**
 * Which face of Pretendard a piece of text is drawn in.
 *
 * Pretendard is bundled (`assets/fonts`, SIL Open Font License 1.1): one face
 * per weight, each named by its file, which is also its PostScript name, so the
 * same `fontFamily` reaches the same face on Android (where the file name is
 * the family) and on iOS (where the PostScript name is).
 *
 * ## Bold text
 *
 * Android's "Bold text" setting raises the weight of a TextView's typeface by
 * `Configuration.fontWeightAdjustment` (300). React Native never applies it: it
 * gives every run of text a typeface of exactly the weight its style names. So
 * the app applies it here, the way Android does to its own text: the style's
 * weight plus the adjustment, to the nearest face bundled. iOS's Bold Text has
 * no amount; it takes the same step (`IOS_BOLD_TEXT_STEP`).
 *
 * Never below Medium (500): body text is 500, and nothing in the app is drawn
 * lighter, Bold text or not.
 *
 * In pure TypeScript, with no imports, so `typeface.test.ts` runs on Node.
 */
export const FACES = {
  500: 'Pretendard-Medium',
  600: 'Pretendard-SemiBold',
  700: 'Pretendard-Bold',
  800: 'Pretendard-ExtraBold',
  900: 'Pretendard-Black',
} as const;

export type FaceWeight = keyof typeof FACES;

/** What Android's Bold text adds, used for iOS's Bold Text, which says only on or off. */
export const IOS_BOLD_TEXT_STEP = 300;

const LIGHTEST = 500;
const HEAVIEST = 900;

/** A style's `fontWeight` as a number: '600' or 600, 'bold', 'normal'; Medium when unset. */
export function weightOf(fontWeight: unknown): number {
  if (typeof fontWeight === 'number') return fontWeight;
  if (fontWeight === 'bold') return 700;
  if (fontWeight === 'normal') return 400;
  if (typeof fontWeight === 'string' && /^\d+$/.test(fontWeight)) return Number(fontWeight);
  return LIGHTEST;
}

/**
 * The face, and the weight to name with it, for a style's weight raised by
 * Bold text's adjustment. The weight is the face's own, so nothing synthesises
 * a bolder or lighter version of it.
 */
export function typeface(fontWeight: unknown, adjustment = 0): { fontFamily: string; fontWeight: `${FaceWeight}` } {
  const raised = weightOf(fontWeight) + (Number.isFinite(adjustment) ? adjustment : 0);
  const weight = Math.min(HEAVIEST, Math.max(LIGHTEST, Math.round(raised / 100) * 100)) as FaceWeight;
  return { fontFamily: FACES[weight], fontWeight: `${weight}` };
}
