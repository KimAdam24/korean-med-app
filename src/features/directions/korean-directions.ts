import { assessField } from '../ocr/field-integrity.ts';
import {
  APPROVED_COMPOSITION,
  APPROVED_PHRASES,
  type ApprovedPhrase,
  type Composition,
} from './approved-phrases.ts';

/**
 * A direction in Korean, built only from approved phrases, or null.
 *
 * ## All or nothing
 *
 * Every word of the English must belong to an approved phrase, in every
 * sentence of it, or the answer is null and the English is shown alone. A
 * direction is never partly translated: a Korean sentence missing the part
 * that was not approved reads as the whole instruction, and the missing part
 * is usually the one that matters (`UP TO`, `FOR 10 DAYS`, `LEFT EYE`).
 *
 * Nothing is composed that was not reviewed. The phrases are matched exactly
 * (no numbers are filled in, no words inflected), and how they join is the
 * approved composition; with either table empty, the answer is always null.
 *
 * ## Never over damaged text
 *
 * Text the damage check judges damaged is refused here as well as by the
 * screens, so a caller that forgets cannot translate a misread into fluent
 * Korean, which would hide the damage that the English at least shows.
 */
export type KoreanDirections = {
  readonly ko: string;
  /** The IDs of the phrases used, in the order they matched. */
  readonly phrases: readonly string[];
};

export function koreanDirections(
  english: string,
  phrases: readonly ApprovedPhrase[] = APPROVED_PHRASES,
  composition: Composition | null = APPROVED_COMPOSITION
): KoreanDirections | null {
  if (!composition || phrases.length === 0) return null;
  if (!english.trim() || assessField('instructions', english).level === 'damaged') return null;

  const table = phrases.map((phrase) => ({ phrase, words: wordsOf(phrase.en) }));
  const sentences = english
    .split(/\.(?=\s|$)/)
    .map((sentence) => wordsOf(sentence))
    .filter((words) => words.length > 0);
  if (sentences.length === 0) return null;

  const rendered: string[] = [];
  const used: string[] = [];
  for (const words of sentences) {
    const sentence = renderSentence(words, table, composition);
    if (!sentence) return null;
    rendered.push(sentence.ko);
    used.push(...sentence.phrases);
  }
  return { ko: rendered.join(' '), phrases: used };
}

/** Upper case, commas and runs of space gone: how phrases and directions are compared. */
function wordsOf(text: string): string[] {
  return text.toUpperCase().replace(/,/g, ' ').split(/\s+/).filter(Boolean);
}

function renderSentence(
  words: readonly string[],
  table: readonly { phrase: ApprovedPhrase; words: readonly string[] }[],
  composition: Composition
): KoreanDirections | null {
  const matched: ApprovedPhrase[] = [];
  let bareTake = false;

  for (let at = 0; at < words.length; ) {
    // The longest phrase that fits here: AS NEEDED FOR PAIN before AS NEEDED.
    let best: { phrase: ApprovedPhrase; words: readonly string[] } | null = null;
    for (const entry of table) {
      if (entry.words.length > words.length - at) continue;
      if (best && entry.words.length <= best.words.length) continue;
      if (entry.words.every((word, index) => words[at + index] === word)) best = entry;
    }
    if (best) {
      matched.push(best.phrase);
      at += best.words.length;
    } else if (at === 0 && words[0] === 'TAKE') {
      // "TAKE WITH FOOD": the verb alone, when no phrase begins with it here.
      bareTake = true;
      at += 1;
    } else {
      return null;
    }
  }

  const of = (category: ApprovedPhrase['category']) => matched.filter((phrase) => phrase.category === category);
  const [whole] = of('sentence');
  if (whole) {
    // A whole instruction stands alone; joined to anything, it is refused.
    return matched.length === 1 && !bareTake ? { ko: whole.ko + composition.end, phrases: [whole.id] } : null;
  }

  const actions = of('action');
  const frequencies = of('frequency');
  const routes = of('route');
  const conditions = of('condition');
  // One of each at most: two frequencies is a taper or a schedule change, and
  // two actions two instructions; neither is composed from fragments.
  if (actions.length > 1 || frequencies.length > 1 || routes.length > 1) return null;
  if (new Set(conditions.map((phrase) => phrase.id)).size !== conditions.length) return null;
  // Something to do: an action, or TAKE on its own. Never both, never neither.
  const hasAction = actions.length === 1;
  if (hasAction === bareTake) return null;

  const verb = actions[0]?.ko ?? composition.bareTake;
  const rest = [...conditions, ...routes]
    .map((phrase) => phrase.ko)
    .concat(verb)
    .filter((part) => part.length > 0)
    .join(' ');
  const lead = frequencies[0] ? frequencies[0].ko + composition.afterFrequency : '';

  return { ko: lead + rest + composition.end, phrases: matched.map((phrase) => phrase.id) };
}
