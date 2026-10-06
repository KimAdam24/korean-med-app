/**
 * The app's colours, light and dark: "indigo on hanji" (design pass of
 * 2026-10-06, direction B).
 *
 * Quiet, not clinical. A paper-toned page, white cards edged by a fine line
 * rather than lifted by a shadow, deep indigo (쪽빛) for the one action on a
 * screen. Only two things are ever tinted: info notes, in indigo, and warnings,
 * in amber. Content cards stay white, so a warning is the one coloured box on
 * a screen and nothing competes with it.
 *
 * The warmth is in the neutrals, never the accent: orange, brown and yellow
 * are amber's, and an accent near them would make warnings stop standing out.
 * The amber below is unchanged from before the design pass.
 *
 * In pure TypeScript, with no imports, so `colors.test.ts` can check every
 * pair on Node: body and secondary text at 7:1 or more on every surface they
 * sit on, button labels and links at 4.5:1, control edges and icons at 3:1,
 * and the warning tint plainly apart from the page and the info tint.
 */
export const Colors = {
  light: {
    text: '#1A1D29',
    background: '#ffffff',
    backgroundElement: '#ECE9E3',
    /** Pressed rows and outlined buttons. */
    backgroundSelected: '#E9E5DD',
    textSecondary: '#474C5B',

    /** Behind cards: hanji, a warm paper tone, low in colour so amber stays amber against it. */
    page: '#F2F0EC',
    surface: '#FFFFFF',
    /** Edges of controls a finger has to find: keypad keys, outlined buttons. */
    border: '#7C7F88',
    /**
     * Edges of cards and the rules inside them. A card is set apart by this
     * line and by white on the page, not by a shadow.
     */
    hairline: '#D9D3C8',
    /** Secondary button outline and link text. */
    outline: '#2C3E70',
    /** Primary button fill: 쪽빛, deep indigo. */
    primary: '#2C3E70',
    primaryPressed: '#22315A',
    onPrimary: '#FFFFFF',
    /** A pale indigo. Not used for a surface: content cards stay white. */
    primaryWash: '#E7EAF3',
    primaryIcon: '#2C3E70',

    infoSurface: '#EBEEF6',
    infoText: '#1F2C55',
    infoAccent: '#2C3E70',
    onInfoAccent: '#FFFFFF',
    /** A notice's outline: decorative, since its badge and words carry the meaning. */
    infoEdge: '#C3CAE0',

    warnSurface: '#FFF3E0',
    warnText: '#6B3A00',
    warnAccent: '#A34F00',
    onWarnAccent: '#FFFFFF',
    warnEdge: '#EFC994',

    /** Where raw OCR text is shown as evidence rather than as an answer. */
    recessed: '#ECEDF0',
    recessedText: '#2B2F36',
    damagedMark: '#FFD9A8',
    damagedMarkText: '#2B2F36',
  },
  dark: {
    text: '#ECEDF2',
    background: '#000000',
    backgroundElement: '#21242C',
    backgroundSelected: '#2A2E39',
    textSecondary: '#B4B8C5',

    /** Ink, with a little of the indigo in it. */
    page: '#111318',
    surface: '#1B1E26',
    border: '#737888',
    hairline: '#2D313C',
    outline: '#A3B4EC',
    /**
     * Lighter than the light mode's fill: deep indigo would not show against
     * the dark page. Still dark enough for the same white label.
     */
    primary: '#4A66B6',
    primaryPressed: '#3E58A0',
    onPrimary: '#FFFFFF',
    primaryWash: '#1E2540',
    primaryIcon: '#A3B4EC',

    infoSurface: '#1B2240',
    infoText: '#D7DEF7',
    infoAccent: '#A3B4EC',
    onInfoAccent: '#10172B',
    infoEdge: '#34406B',

    warnSurface: '#2E1D06',
    warnText: '#FFD7A3',
    warnAccent: '#E8912A',
    onWarnAccent: '#1A1000',
    warnEdge: '#6A4613',

    recessed: '#24272C',
    recessedText: '#D5D8DE',
    damagedMark: '#5A3A0A',
    damagedMarkText: '#FFE7C7',
  },
} as const;
