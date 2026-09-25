/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform, type ViewStyle } from 'react-native';

/**
 * Every foreground/background pair below was checked with the WCAG contrast
 * formula before being committed — 4.5:1 for text, 3:1 for component edges —
 * using the mobile-app-design skill's checker. The ratios are in the comments
 * so a later change can be checked against the bar it has to clear.
 *
 * The audience sets the bar higher than the minimum where it cheaply can: most
 * body text sits well above 7:1, because an elderly reader in poor light is
 * the normal case here, not the edge case.
 */
export const Colors = {
  light: {
    text: '#111418', // 18.5 on surface, 16.7 on page
    background: '#ffffff',
    backgroundElement: '#EFECE6',
    /** Pressed rows and outlined buttons. Their labels clear 5.0 (blue), 4.5 (caution). */
    backgroundSelected: '#E9E5DD',
    textSecondary: '#4B5059', // 8.1 on surface, 7.3 on page

    /**
     * Behind cards. A warm paper tone rather than grey: the white cards on it
     * read as objects, and the whole app reads as calm rather than clinical.
     */
    page: '#F5F3EF',
    surface: '#FFFFFF',
    /**
     * Edges of controls a finger has to find — keypad keys, outlined buttons.
     * 3.4 on page, 3.7 on surface: the 3:1 WCAG asks of a control's boundary.
     */
    border: '#80858E',
    /**
     * Edges of cards and the rules inside them. Deliberately faint (1.3):
     * a card is a grouping, not a control, and it is also set apart by its
     * shadow and by white on a tinted page. Everything a reader must find or
     * press keeps a contrast-checked edge (`border`).
     */
    hairline: '#E5E1D9',
    /** Secondary button outline and link text. 5.7 on page. */
    outline: '#1B5FB0',
    /** Primary button fill. */
    primary: '#1B5FB0',
    primaryPressed: '#154C8E',
    onPrimary: '#FFFFFF', // 6.3 on primary, 8.6 on pressed
    /** A soft wash of the primary, behind an icon in a list row. */
    primaryWash: '#E3EDFA',
    primaryIcon: '#1B5FB0', // 5.4 on the wash, 5.7 on page

    infoSurface: '#E8F1FB',
    infoText: '#0B3A70', // 9.9
    infoAccent: '#1B5FB0',
    onInfoAccent: '#FFFFFF', // 6.3

    /** A notice's outline: decorative, since its badge and words carry the meaning. */
    infoEdge: '#BFD5F2',

    warnSurface: '#FFF3E0',
    warnText: '#6B3A00', // 8.6
    warnAccent: '#A34F00', // edge 5.2 against the tint
    onWarnAccent: '#FFFFFF', // 5.7
    warnEdge: '#EFC994',

    /** Where raw OCR text is shown as evidence rather than as an answer. */
    recessed: '#ECEDF0',
    recessedText: '#2B2F36', // 11.5
    damagedMark: '#FFD9A8',
    damagedMarkText: '#2B2F36', // 10.1
  },
  dark: {
    text: '#F2F3F5', // 15.4 on surface, 17.3 on page
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B4B8BF', // 8.6 on surface, 9.6 on page

    page: '#0E0F11',
    surface: '#1A1C20',
    border: '#6B7079', // 3.4 on surface, 3.9 on page
    hairline: '#2C2F35',
    outline: '#5B93DB', // 6.1 on page
    // The same fill in both modes: white on it clears 6.3 either way, and a
    // lighter blue would need dark text and stop reading as the same button.
    primary: '#1B5FB0',
    primaryPressed: '#154C8E',
    onPrimary: '#FFFFFF',
    primaryWash: '#16263B',
    // Not the fill: that is 3.0 on the dark page, too faint for a graphic.
    primaryIcon: '#8DBBF5', // 7.7 on the wash, 9.6 on page

    infoSurface: '#10243E',
    infoText: '#CFE3FB', // 11.9
    infoAccent: '#8DBBF5',
    onInfoAccent: '#0B1A2E', // 8.8
    infoEdge: '#2A4C78',

    warnSurface: '#2E1D06',
    warnText: '#FFD7A3', // 12.0
    warnAccent: '#E8912A', // edge 6.6
    onWarnAccent: '#1A1000', // 7.6
    warnEdge: '#6A4613',

    recessed: '#24272C',
    recessedText: '#D5D8DE', // 10.5
    damagedMark: '#5A3A0A',
    damagedMarkText: '#FFE7C7', // 8.6
  },
} as const;

/**
 * Depth, for surfaces that are objects rather than controls. Soft and low: it
 * separates a card from the page without drawing the eye. Light mode only — on
 * a dark page a shadow cannot be seen, and a surface is already lighter than
 * the page beneath it.
 *
 * `boxShadow` needs the New Architecture (always on in SDK 57) and draws on
 * Android 9 and later; below that the card keeps its hairline edge.
 */
export const Elevation = {
  light: {
    card: { boxShadow: '0 1px 2px rgba(45, 38, 25, 0.06), 0 6px 20px rgba(45, 38, 25, 0.07)' },
    /** The primary button: lifted a little, in its own colour, so it reads as pressable. */
    raised: { boxShadow: '0 4px 12px rgba(27, 95, 176, 0.28)' },
  },
  dark: {
    card: {},
    raised: {},
  },
} as const satisfies Record<'light' | 'dark', Record<'card' | 'raised', ViewStyle>>;

/** Corner radii, shared so every surface in the app reads as one family. */
export const Radius = {
  card: 16,
  /** Large touch targets: buttons and keypad keys. */
  button: 20,
  inner: 12,
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
