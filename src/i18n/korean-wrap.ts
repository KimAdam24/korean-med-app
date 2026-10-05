/**
 * Korean wrapped between words, as it is written, not inside them.
 *
 * Android breaks a line of Korean at any syllable, as it does Chinese and
 * Japanese: "울리게 하 / 기", "아 / 니에요". Korean is spaced into words, and
 * read word by word; a word split across lines is a stumble, worse for the
 * older reader this app is for. iOS has a line-break strategy for it
 * (`lineBreakStrategyIOS="hangul-word"`); Android has none React Native can
 * set. So on Android each word's letters are joined by WORD JOINER (U+2060),
 * which allows no break beside it and shows nothing, and lines break only at
 * the spaces. What a screen reader is given stays the text as written.
 */
import { HANGUL } from './hangul.ts';

export const WORD_JOINER = '\u2060';

/**
 * The text with a WORD JOINER between each two characters of a word with
 * Korean in it, at either side of the pair: "다음 알림" keeps its space, and
 * nothing breaks inside "다음" or "알림", nor between "FDA" and "가". English
 * words are left alone; they break only at spaces already.
 */
export function keepWordsWhole(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const here = text[i];
    const next = text[i + 1];
    out += here;
    if (next !== undefined && !/\s/.test(here) && !/\s/.test(next) && (HANGUL.test(here) || HANGUL.test(next))) {
      out += WORD_JOINER;
    }
  }
  return out;
}
