/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

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
    text: '#111418', // 18.5 on surface, 16.6 on page
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#4B5059', // 8.1 on surface, 7.3 on page

    /** Behind cards. Grey so a white card reads as an object. */
    page: '#F2F3F5',
    surface: '#FFFFFF',
    /** Card and field edges. 3.3 — visible to low vision, not heavy. */
    border: '#8A8F98',
    /** Secondary button outline and link text. 5.7 on page. */
    outline: '#1B5FB0',

    infoSurface: '#E8F1FB',
    infoText: '#0B3A70', // 9.9
    infoAccent: '#1B5FB0',
    onInfoAccent: '#FFFFFF', // 6.3

    warnSurface: '#FFF3E0',
    warnText: '#6B3A00', // 8.6
    warnAccent: '#A34F00', // edge 5.2 against the tint
    onWarnAccent: '#FFFFFF', // 5.7

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
    border: '#6B7079', // 3.4
    outline: '#5B93DB', // 6.1 on page

    infoSurface: '#10243E',
    infoText: '#CFE3FB', // 11.9
    infoAccent: '#8DBBF5',
    onInfoAccent: '#0B1A2E', // 8.8

    warnSurface: '#2E1D06',
    warnText: '#FFD7A3', // 12.0
    warnAccent: '#E8912A', // edge 6.6
    onWarnAccent: '#1A1000', // 7.6

    recessed: '#24272C',
    recessedText: '#D5D8DE', // 10.5
    damagedMark: '#5A3A0A',
    damagedMarkText: '#FFE7C7', // 8.6
  },
} as const;

/** Card corner radius, shared so every surface in the app reads as one family. */
export const Radius = {
  card: 16,
  inner: 12,
  pill: 999,
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
