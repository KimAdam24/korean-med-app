/**
 * The app's design tokens: colours (`colors.ts`), depth, corner radii, type,
 * spacing and icon sizes, for light and dark.
 */

import '@/global.css';

import { Platform, type ViewStyle } from 'react-native';

import { Colors } from './colors';

export { Colors };

/**
 * Depth: none. Since the design pass (2026-10-06), a card is set apart by its
 * fine edge and by white on the paper page, like a printed leaflet, and the
 * primary button by its solid fill. A shadow made every card read as an object
 * lifted off the screen, which is the "app" look the pass moved away from.
 *
 * Kept as tokens, empty, so a surface that ever needs depth has one place to
 * get it.
 */
export const Elevation = {
  light: { card: {}, raised: {} },
  dark: { card: {}, raised: {} },
} as const satisfies Record<'light' | 'dark', Record<'card' | 'raised', ViewStyle>>;

/** Corner radii, shared so every surface in the app reads as one family. */
export const Radius = {
  card: 14,
  /** Large touch targets: buttons and keypad keys. */
  button: 14,
  inner: 10,
  pill: 999,
} as const;

/**
 * The type ramp. Sizes start well above the platform defaults because the
 * reader is elderly (spec §2); font scaling stays on, so nothing may assume a
 * fixed text height. The English gloss is deliberately small — see
 * `BilingualText`.
 */
export const Type = {
  heading: { fontSize: 30, lineHeight: 40, fontWeight: '700' },
  button: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  /** A row or card title: body size, heavier. */
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  body: { fontSize: 22, lineHeight: 32, fontWeight: '500' },
  label: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  gloss: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
} as const;

/**
 * How far each size may grow with the system text size — so that nothing here
 * grows past what the system itself would draw for its own body text at the
 * user's setting.
 *
 * The ramp above already starts about 1.3x the platform defaults. Scaled
 * again without limit, iOS's largest accessibility size (3.1x) turned a 30pt
 * heading into 94pt: one word to a line, and far more than the user asked the
 * phone for. Each limit stops a size at roughly the system's largest body
 * text (iOS AX5 body is 53pt), headings a little above. Android tops out at
 * 2x, below every limit but the heading's, so there nothing changes.
 */
export const TypeMaxScale = {
  heading: 2, // 60pt
  button: 2.2, // 53pt
  title: 2.4, // 53pt
  body: 2.4, // 53pt
  label: 3, // 54pt
  gloss: 3, // 42pt
} as const;

/**
 * Where the system text size counts as large enough that layouts should make
 * room — dropping a decorative icon beside a label, say — rather than squeeze
 * the words. Android's largest setting is 2x, iOS's first accessibility size
 * about 1.8x.
 */
export const LARGE_TEXT_SCALE = 1.6;

/** Icon sizes, matched to the type they sit beside. */
export const IconSize = {
  row: 28,
  button: 28,
  hero: 44,
} as const;

/**
 * The capture screen's chrome. Fixed rather than themed: it sits over a live
 * camera image, which is dark whatever the system setting.
 */
export const CameraChrome = {
  background: '#000000',
  foreground: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.55)',
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;
