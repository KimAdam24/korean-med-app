import { Platform } from 'react-native';

import { keepWordsWhole } from '@/i18n/korean-wrap';

/**
 * Korean as it is drawn: on Android, joined within its words, which Android
 * otherwise breaks at any syllable (`keepWordsWhole`). iOS is told instead,
 * with `lineBreakStrategyIOS="hangul-word"` on the Text. Only for what is
 * drawn: a screen reader is given the text as written.
 */
export const shownKorean = (text: string): string => (Platform.OS === 'android' ? keepWordsWhole(text) : text);
