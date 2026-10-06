/**
 * Which face of Pretendard a piece of text is drawn in.
 *
 * Pretendard is bundled (`assets/fonts`, SIL Open Font License 1.1), one file
 * per weight, embedded by expo-font's plugin differently on each platform:
 *
 * - **Android:** as one font family, `Pretendard`, declared with each file's
 *   weight (the plugin's `android.fonts`, a font XML registered at launch).
 *   React Native then picks the face by weight. Not as loose asset files: for
 *   one of those, React Native turns any weight of 700 or more into "bold" and
 *   looks for a file named `<family>_bold`, which these are not, and falls back
 *   to the phone's own font. Every heading and button would have been Roboto.
 * - **iOS:** each face by its PostScript name, which is also its file name
 *   (`Pretendard-Bold`), with the weight beside it.
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

/** The one family Android knows the five faces by (`android.fonts` in app.json). */
export const ANDROID_FAMILY = 'Pretendard';

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
 * Bold text's adjustment, on a platform (`Platform.OS`). The weight is the
 * face's own, so nothing synthesises a bolder or lighter version of it.
 */
export function typeface(
  fontWeight: unknown,
  adjustment = 0,
  platform = 'ios'
): { fontFamily: string; fontWeight: `${FaceWeight}` } {
  const raised = weightOf(fontWeight) + (Number.isFinite(adjustment) ? adjustment : 0);
  const weight = Math.min(HEAVIEST, Math.max(LIGHTEST, Math.round(raised / 100) * 100)) as FaceWeight;
  return { fontFamily: platform === 'android' ? ANDROID_FAMILY : FACES[weight], fontWeight: `${weight}` };
}
