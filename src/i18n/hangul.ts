/**
 * Hangul, in every block it is written in: jamo, compatibility jamo, the
 * extended jamo, syllables, and the halfwidth forms.
 */
export const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF\uFFA0-\uFFDC]/;

/** Whether text has any Korean letter in it. */
export const hasHangul = (text: string): boolean => HANGUL.test(text);
