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

import type { LabelKind } from '@/features/ocr/label-kind';

import { findApprovedUses, type ApprovedUses, type DoseForm, type UsesTarget } from './approved-uses';
import { identifyByName, printedRelease, printedSalts, type NameMatch } from './identify-name';

/** What to show the approved uses of. */
export type UsesSource =
  /** A barcode's product: exactly this one. */
  | { readonly kind: 'product'; readonly ndc11: string; readonly rxcui: string }
  /**
   * A medicine by its name. `name` is null when the name was not read whole
   * (withheld as cut off, or damaged, or not found): nothing is looked up for
   * it, and the card says how to give it. `typed` when the user typed it from
   * the bottle, which the card says too, since it is the user's word and not
   * the label's. `known` is a match already made, as when a saved medicine
   * carries one. `labelKind` is what kind of label was read, where it is
   * known: a pharmacy's, or an over-the-counter package's.
   */
  | {
      readonly kind: 'name';
      readonly name: string | null;
      readonly form: DoseForm | null;
      readonly typed?: boolean;
      readonly known?: NameMatch;
      readonly labelKind?: LabelKind | null;
    };

type State =
  | { readonly kind: 'looking' }
  | { readonly kind: 'unidentified' }
  | { readonly kind: 'none' }
  | { readonly kind: 'formUnknown' }
  | { readonly kind: 'kindUnknown' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'found'; readonly uses: AttributedGuidance<ApprovedUses>; readonly match?: NameMatch };

/**
 * What the medicine's FDA label says it is approved to treat, in the label's
 * own English, under a heading that says what it is, with the label named.
 * Between the heading and the label's words, before them, the disclaimer: it
 * may be prescribed for something else, and this is the approved indication,
 * not the doctor's reason.
 *
 * Every state says something. "Could not be identified", "no approved label",
 * "only for tablets and capsules", "prescription or over the counter cannot
 * be told" and "could not be reached" are different, and only the last offers
 * to try again; an empty space would read as nothing to know.
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
        target = {
          kind: 'ingredients',
          rxcui: match.rxcui,
          ingredients: match.ingredients,
          form: current.form,
          // The salt and release the name printed, and the kind of label read:
          // which of the ingredient's labels is this medicine's.
          salts: printedSalts(current.name!, match.ingredients),
          release: printedRelease(current.name!),
          labelKind: current.labelKind ?? null,
        };
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
          {/*
            The caveat first, before a word of the label: read after it, it
            came too late. The vitamin D2 label says rickets; someone who read
            that as their reason, and stopped, never reached the note that it
            is not. Amber, as a caution, not the blue of an aside.
          */}
          <Notice tone="warn" title={Strings.uses.disclaimer} />
          {state.match ? (
            <View style={styles.source}>
              <BilingualText
                text={fillTemplate(
                  source.kind === 'name' && source.typed ? Strings.uses.identifiedTypedAs : Strings.uses.identifiedAs,
                  { name: state.match.ingredients.join(' / ') }
                )}
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
        </>
      ) : (
        <>
          <BilingualText
            text={
              state.kind === 'unidentified'
                ? // Why, and what to do: a name not read whole is to be typed
                  // or retaken; a typed one that matched nothing, checked.
                  unreadable
                  ? Strings.uses.nameNotWhole
                  : source.kind === 'name' && source.typed
                    ? Strings.uses.typedUnidentified
                    : Strings.uses.unidentified
                : state.kind === 'none'
                  ? Strings.uses.none
                  : state.kind === 'formUnknown'
                    ? Strings.uses.formUnknown
                    : state.kind === 'kindUnknown'
                      ? Strings.uses.kindUnknown
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
