import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card } from '@/components/card';
import { Notice } from '@/components/notice';
import { Spacing, TypeMaxScale } from '@/constants/theme';
import type { AttributedGuidance } from '@/features/guidance/attribution';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate } from '@/i18n/strings';

import { findApprovedUses, type ApprovedUses, type DoseForm, type UsesTarget } from './approved-uses';
import { identifyByName, type NameMatch } from './identify-name';

/** What to show the approved uses of. */
export type UsesSource =
  /** A barcode's product: exactly this one. */
  | { readonly kind: 'product'; readonly ndc11: string; readonly rxcui: string }
  /**
   * A medicine by the name on its label. `name` is null when the name was not
   * read whole (withheld as cut off, or damaged): nothing is looked up for it.
   * `known` is a match already made, as when a saved medicine carries one.
   */
  | {
      readonly kind: 'name';
      readonly name: string | null;
      readonly form: DoseForm | null;
      readonly known?: NameMatch;
    };

type State =
  | { readonly kind: 'looking' }
  | { readonly kind: 'unidentified' }
  | { readonly kind: 'none' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'found'; readonly uses: AttributedGuidance<ApprovedUses>; readonly match?: NameMatch };

/**
 * What the medicine's FDA label says it is approved to treat, in the label's
 * own English, under a heading that says what it is, with the label named and
 * the disclaimer beside it: it may be prescribed for something else, and this
 * is the approved indication, not the doctor's reason.
 *
 * Every state says something. "Could not be identified", "no approved label"
 * and "could not be reached" are different, and only the last offers to try
 * again; an empty space would read as nothing to know.
 */
export function ApprovedUsesCard({
  source,
  onIdentified,
}: {
  source: UsesSource;
  /** Told what a name was identified as (or that it was not), for saving with the medicine. */
  onIdentified?: (match: NameMatch | null) => void;
}) {
  const theme = useTheme();
  const [attempt, setAttempt] = useState(0);
  // The latest result, with the request it answers: while it answers an older
  // one (another medicine, or before "try again"), the state is "looking".
  const [result, setResult] = useState<{ readonly request: string; readonly state: State } | null>(null);
  const told = useRef(onIdentified);
  useEffect(() => {
    told.current = onIdentified;
  });

  // Looked up again only when what is being looked up changes, or on "try again".
  const key = JSON.stringify(source);
  const request = `${key}#${attempt}`;
  // A name not read whole is not looked up at all.
  const unreadable = source.kind === 'name' && !source.name;
  const state: State = unreadable
    ? { kind: 'unidentified' }
    : result?.request === request
      ? result.state
      : { kind: 'looking' };

  useEffect(() => {
    const current = JSON.parse(key) as UsesSource;
    if (current.kind === 'name' && !current.name) {
      told.current?.(null);
      return;
    }
    let live = true;
    const settle = (next: State) => {
      if (live) setResult({ request, state: next });
    };

    void (async () => {
      let target: UsesTarget;
      let match: NameMatch | undefined;
      if (current.kind === 'product') {
        target = { kind: 'product', ndc11: current.ndc11, rxcui: current.rxcui };
      } else {
        if (current.known) {
          match = current.known;
        } else {
          const identified = await identifyByName(current.name!);
          if (!live) return;
          if (identified.status === 'unavailable') return settle({ kind: 'unavailable' });
          if (identified.status === 'unidentified') {
            told.current?.(null);
            return settle({ kind: 'unidentified' });
          }
          match = identified.match;
        }
        told.current?.(match);
        target = { kind: 'ingredients', rxcui: match.rxcui, ingredients: match.ingredients, form: current.form };
      }

      const found = await findApprovedUses(target);
      settle(found.status === 'found' ? { kind: 'found', uses: found.uses, match } : { kind: found.status });
    })();

    return () => {
      live = false;
    };
  }, [key, request]);

  return (
    <Card>
      <BilingualText text={Strings.uses.title} variant="label" />

      {state.kind === 'looking' ? (
        <View style={styles.row}>
          <ActivityIndicator color={theme.primaryIcon} />
          <BilingualText text={Strings.uses.looking} variant="label" color={theme.textSecondary} style={styles.grow} />
        </View>
      ) : state.kind === 'found' ? (
        <>
          {state.match ? (
            <View style={styles.source}>
              <BilingualText
                text={fillTemplate(Strings.uses.identifiedAs, { name: state.match.ingredients.join(' / ') })}
                variant="label"
              />
              <BilingualText text={Strings.guidance.perRxNorm} variant="label" color={theme.textSecondary} />
            </View>
          ) : null}
          <Text
            style={[styles.text, { color: theme.text }]}
            maxFontSizeMultiplier={TypeMaxScale.body}
            // The label's own words, in English, read in an English voice.
            accessibilityLanguage="en-US">
            {state.uses.content.text}
          </Text>
          <View style={styles.source}>
            <BilingualText text={state.uses.attribution.label} variant="label" color={theme.textSecondary} />
            <BilingualText
              text={fillTemplate(Strings.uses.fromLabel, { title: state.uses.content.label.title })}
              variant="label"
              color={theme.textSecondary}
            />
          </View>
          <Notice tone="info" title={Strings.uses.disclaimer} />
        </>
      ) : (
        <>
          <BilingualText
            text={
              state.kind === 'unidentified'
                ? Strings.uses.unidentified
                : state.kind === 'none'
                  ? Strings.uses.none
                  : Strings.uses.unavailable
            }
            color={theme.textSecondary}
          />
          {state.kind === 'unavailable' ? (
            <BigButton label={Strings.uses.retry} tone="secondary" onPress={() => setAttempt((n) => n + 1)} />
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  grow: {
    flex: 1,
  },
  source: {
    gap: Spacing.one,
  },
  text: {
    fontSize: 20,
    lineHeight: 30,
  },
});
