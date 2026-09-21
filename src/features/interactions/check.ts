import type { MedicationRecord } from '@/features/medications/types';

// Extension included so this resolves under plain Node as well as Metro; the
// unit tests run on Node, and a value import without one fails there.
import { INTERACTION_RULES } from './rules.ts';
import type {
  IngredientRef,
  InteractionCheck,
  InteractionFinding,
  InteractionRule,
} from './types';

/**
 * Matches a medication profile against the interaction rules (spec §3.4).
 *
 * Pure and offline. Ingredients are stored on each record when it is saved, so
 * a user is never waiting on a network call — or unable to check at all,
 * because they are somewhere without signal — to find out that two of their
 * medicines do not mix.
 */

function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function spellingsOf(ref: IngredientRef): string[] {
  return [ref.ingredient, ...(ref.aliases ?? [])].map(normalise);
}

/** The stored ingredient that satisfies `ref`, if any. */
function matchIngredient(
  ingredients: readonly string[],
  ref: IngredientRef
): string | null {
  const wanted = spellingsOf(ref);
  return ingredients.find((name) => wanted.includes(normalise(name))) ?? null;
}

/**
 * Tests one rule against one pair.
 *
 * Both orderings are tried because a rule is symmetric — "warfarin with
 * aspirin" is the same interaction as "aspirin with warfarin" — and requiring
 * the table to list both directions would double it and invite one of the two
 * to be edited without the other.
 */
function matchPair(
  rule: InteractionRule,
  first: readonly string[],
  second: readonly string[]
): readonly [string, string] | null {
  const forward = [matchIngredient(first, rule.a), matchIngredient(second, rule.b)] as const;
  if (forward[0] && forward[1]) return [forward[0], forward[1]];

  const reverse = [matchIngredient(first, rule.b), matchIngredient(second, rule.a)] as const;
  if (reverse[0] && reverse[1]) return [reverse[0], reverse[1]];

  return null;
}

export function checkInteractions(
  medications: readonly MedicationRecord[],
  rules: readonly InteractionRule[] = INTERACTION_RULES
): InteractionCheck {
  const checkable = medications.filter(
    (record) => (record.identity?.ingredients?.length ?? 0) > 0
  );

  /**
   * A record with no stored ingredients is not evidence of safety. It is
   * reported so the caller can say which medicines were examined — "nothing
   * found" across a profile where half the entries were never looked at is a
   * materially different statement from one where they all were.
   */
  const uncheckable = medications
    .filter((record) => (record.identity?.ingredients?.length ?? 0) === 0)
    .map((record) => record.id);

  const findings: InteractionFinding[] = [];

  for (let i = 0; i < checkable.length; i += 1) {
    for (let j = i + 1; j < checkable.length; j += 1) {
      const first = checkable[i];
      const second = checkable[j];

      // Two records of the same medicine — a refill saved twice — share every
      // ingredient and would match any rule naming one of them against itself.
      if (sharesEveryIngredient(first, second)) continue;

      for (const rule of rules) {
        const matched = matchPair(
          rule,
          first.identity?.ingredients ?? [],
          second.identity?.ingredients ?? []
        );
        if (matched) {
          findings.push({ rule, medicationIds: [first.id, second.id], matched });
        }
      }
    }
  }

  return { findings, uncheckable };
}

function sharesEveryIngredient(a: MedicationRecord, b: MedicationRecord): boolean {
  const first = (a.identity?.ingredients ?? []).map(normalise).sort();
  const second = (b.identity?.ingredients ?? []).map(normalise).sort();
  return (
    first.length > 0 &&
    first.length === second.length &&
    first.every((name, index) => name === second[index])
  );
}

/**
 * Whether the check examined the whole profile.
 *
 * Exists so a caller cannot accidentally present an empty result as an
 * all-clear: the UI has to ask this question to phrase the answer honestly.
 */
export function isCompleteCheck(check: InteractionCheck): boolean {
  return check.uncheckable.length === 0 && INTERACTION_RULES.length > 0;
}
