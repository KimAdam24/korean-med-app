import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card } from '@/components/card';
import { Disclosure } from '@/components/disclosure';
import { Notice } from '@/components/notice';
import { Radius, Spacing, Type, TypeMaxScale } from '@/constants/theme';
import type { AttributedGuidance } from '@/features/guidance/attribution';
import { useTheme } from '@/hooks/use-theme';
import { Strings, fillTemplate } from '@/i18n/strings';

import type { LabelKind } from '@/features/ocr/label-kind';

import { findApprovedUses, type ApprovedUses, type DoseForm, type UsesTarget } from './approved-uses';
import {
  DELAYED_MARKERS,
  EXTENDED_MARKERS,
  identifyByName,
  printedBrandWords,
  printedRelease,
  printedReleaseToken,
  printedSalts,
  printedStrengths,
  releaseOfMarker,
  type NameMatch,
  type Release,
  type ReleaseMarker,
} from './identify-name';
import { labelParts } from './label-prose';
import { recallLookup, rememberLookup } from './lookup-memory';

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
   * known: a pharmacy's, or an over-the-counter package's. `strength` is the
   * strength line, where it was read whole: a label must give the strength
   * it prints. `release` is what the user said the bottle shows beside the
   * name, asked where the release decides which product it is and none was
   * read (`releaseUnknown`): their reading, as a typed name is, and taken as
   * a printed marker would be.
   */
  | {
      readonly kind: 'name';
      readonly name: string | null;
      readonly form: DoseForm | null;
      readonly typed?: boolean;
      readonly known?: NameMatch;
      readonly labelKind?: LabelKind | null;
      readonly strength?: string | null;
      readonly release?: ReleaseMarker | null;
    };

type State =
  | { readonly kind: 'looking' }
  | { readonly kind: 'unidentified' }
  | { readonly kind: 'hangul' }
  | { readonly kind: 'none' }
  | { readonly kind: 'formUnknown' }
  | { readonly kind: 'kindUnknown' }
  | { readonly kind: 'productUnknown' }
  | { readonly kind: 'strengthUnknown' }
  | { readonly kind: 'releaseUnknown'; readonly releases: readonly ('immediate' | Release)[] }
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
 *
 * One state asks instead: where the release decides which product it is and
 * the bottle showed none (metformin is made released at once and over time),
 * which of the markers it shows beside the name, a tap each, or none. It is
 * a quick check, not a failure: the user is holding the bottle. The answer is
 * the screen's to keep, with the medicine, as the user's word.
 */
export function ApprovedUsesCard({
  source,
  onIdentified,
  onReleaseAnswered,
}: {
  source: UsesSource;
  /** Told what a name was identified as (or that it was not), for saving with the medicine. */
  onIdentified?: (match: NameMatch | null) => void;
  /**
   * Told the marker the user says the bottle shows, or null to be asked
   * again: kept by the screen, with the medicine, and given back as
   * `source.release`. Without it the question is not asked.
   */
  onReleaseAnswered?: (marker: ReleaseMarker | null) => void;
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

    // Asked before, this session: the same answer, without asking again.
    type Kept = { readonly state: State; readonly match: NameMatch | null };
    const kept = recallLookup<Kept>(key);
    if (kept) {
      if (current.kind === 'name') told.current?.(kept.match);
      settle(kept.state);
      return;
    }
    const keep = (next: State, match: NameMatch | null) => {
      if (next.kind !== 'unavailable') rememberLookup(key, { state: next, match } satisfies Kept);
      settle(next);
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
            return keep({ kind: 'unidentified' }, null);
          }
          // Korean in the name: nothing was asked, and the user is told why.
          if (identified.status === 'hangul') {
            told.current?.(null);
            return keep({ kind: 'hangul' }, null);
          }
          match = identified.match;
        }
        told.current?.(match);
        // What the user said the bottle shows, where it printed no release.
        const said = current.release ? releaseOfMarker(current.release) : null;
        target = {
          kind: 'ingredients',
          rxcui: match.rxcui,
          ingredients: match.ingredients,
          form: current.form,
          // What the bottle printed, and the kind of label read: which of the
          // ingredient's labels is this medicine's.
          salts: printedSalts(current.name!, match.ingredients),
          release: printedRelease(current.name!) ?? said?.release ?? null,
          releaseToken: printedReleaseToken(current.name!) ?? said?.token ?? null,
          brand: printedBrandWords(current.name!, match.ingredients),
          strengths: printedStrengths(current.strength),
          labelKind: current.labelKind ?? null,
        };
      }

      const found = await findApprovedUses(target);
      if (!live) return;
      keep(
        found.status === 'found'
          ? { kind: 'found', uses: found.uses, match }
          : found.status === 'releaseUnknown'
            ? { kind: 'releaseUnknown', releases: found.releases }
            : { kind: found.status },
        match ?? null
      );
    })();

    return () => {
      live = false;
    };
  }, [key, request]);

  const [details, setDetails] = useState(false);

  // The medicine the label is for, as found: from the label's words, or the
  // name the user typed.
  const identified =
    state.kind === 'found' && state.match ? (
      <BilingualText
        text={fillTemplate(source.kind === 'name' && source.typed ? Strings.uses.identifiedTypedAs : Strings.uses.identifiedAs, {
          name: state.match.ingredients.join(' / '),
        })}
        variant="label"
      />
    ) : null;

  // The user's answer, said as theirs, with the way to change it.
  const answered =
    source.kind === 'name' && source.release && onReleaseAnswered ? (
      <View style={styles.source}>
        <BilingualText
          text={
            source.release === 'none'
              ? Strings.uses.releaseAnsweredNone
              : fillTemplate(Strings.uses.releaseAnswered, { marker: source.release.toUpperCase() })
          }
          variant="label"
        />
        <BigButton label={Strings.uses.releaseChange} tone="secondary" onPress={() => onReleaseAnswered(null)} />
      </View>
    ) : null;

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
          {/* How the user checks the right medicine was found: always shown. */}
          {identified}
          {answered}
          <LabelText key={state.uses.content.label.setId} text={state.uses.content.text} />
          {/*
            Whose words these are, in one line; which label, and whose match
            of the name, a tap away. All of it used to be shown, four lines
            deep with the label's title in it twice, under every label.
          */}
          <View style={styles.sourceLine}>
            <BilingualText text={state.uses.attribution.label} variant="label" color={theme.textSecondary} />
            <Disclosure
              open={details}
              show={Strings.uses.sourceDetails}
              hide={Strings.uses.sourceDetailsHide}
              onToggle={() => setDetails((open) => !open)}
            />
          </View>
          {details ? (
            <View style={styles.source}>
              {/*
                Korean only, even with English shown: the title is the label's
                own English, and the English line would only say it again.
              */}
              <BilingualText
                text={fillTemplate(Strings.uses.fromLabel, { title: state.uses.content.label.title })}
                variant="label"
                color={theme.textSecondary}
                hideEnglish
              />
              {state.match ? (
                <View style={styles.source}>
                  {identified}
                  <BilingualText text={Strings.guidance.perRxNorm} variant="label" color={theme.textSecondary} />
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : state.kind === 'releaseUnknown' ? (
        // A quick check, not a failure: the letters beside the name, a tap
        // each. Only those of the releases made at the strength.
        <View style={styles.question} accessibilityLiveRegion="polite">
          <BilingualText text={Strings.uses.releaseQuestion} />
          <BilingualText text={Strings.uses.releaseWhy} variant="label" color={theme.textSecondary} />
          {onReleaseAnswered ? (
            <>
              <View style={styles.markers}>
                {[
                  ...(state.releases.includes('extended') ? EXTENDED_MARKERS : []),
                  ...(state.releases.includes('delayed') ? DELAYED_MARKERS : []),
                ].map((marker) => (
                  <Pressable
                    key={marker}
                    onPress={() => onReleaseAnswered(marker)}
                    accessibilityRole="button"
                    // Letter by letter: "E R", not a word.
                    accessibilityLabel={marker.toUpperCase().split('').join(' ')}
                    style={({ pressed }) => [
                      styles.marker,
                      { borderColor: theme.outline, backgroundColor: pressed ? theme.backgroundSelected : theme.surface },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.markerText, { color: theme.text }]} maxFontSizeMultiplier={TypeMaxScale.button}>
                      {marker.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <BigButton label={Strings.uses.releaseNone} tone="secondary" onPress={() => onReleaseAnswered('none')} />
            </>
          ) : null}
        </View>
      ) : (
        <>
          <BilingualText
            text={
              state.kind === 'hangul'
                ? Strings.uses.nameHangul
                : state.kind === 'unidentified'
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
                      : state.kind === 'productUnknown'
                        ? Strings.uses.productUnknown
                        : state.kind === 'strengthUnknown'
                          ? Strings.uses.strengthUnknown
                          : Strings.uses.unavailable
            }
            color={theme.textSecondary}
          />
          {state.kind === 'unavailable' ? (
            <BigButton label={Strings.uses.retry} tone="secondary" onPress={() => setAttempt((n) => n + 1)} />
          ) : null}
          {answered}
        </>
      )}
    </Card>
  );
}

/**
 * The label's own words, in English, read in an English voice on an iPhone;
 * Android's TalkBack takes no language from the app, and reads in the phone's
 * own.
 *
 * Shown whole, but for the FDA's standard background on blood pressure, which
 * folds away behind a button where it stood (see `label-prose`): never a use,
 * never a limitation.
 */
function LabelText({ text }: { text: string }) {
  const theme = useTheme();
  const parts = useMemo(() => labelParts(text), [text]);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const paragraph = (words: string, key?: number) => (
    <Text
      key={key}
      style={[styles.text, { color: theme.text }]}
      maxFontSizeMultiplier={TypeMaxScale.body}
      accessibilityLanguage="en-US">
      {words}
    </Text>
  );

  if (!parts.some((part) => part.background)) return paragraph(text);
  return (
    <View>
      {parts.map((part, index) => {
        // The line breaks between parts are the space between their blocks.
        const words = part.text.replace(/^\n+|\n+$/g, '');
        if (!part.background) return paragraph(words, index);
        const shown = open.has(index);
        return (
          <View key={index}>
            {shown ? paragraph(words) : null}
            <Disclosure
              open={shown}
              show={Strings.uses.explanationShow}
              hide={Strings.uses.explanationHide}
              onToggle={() =>
                setOpen((now) => {
                  const next = new Set(now);
                  if (shown) next.delete(index);
                  else next.add(index);
                  return next;
                })
              }
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sourceLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.three,
  },
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
  question: {
    gap: Spacing.three,
  },
  markers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  marker: {
    // Past the 48dp minimum, for unsteady hands: two letters, large.
    minWidth: 80,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: 2,
    borderRadius: Radius.button,
    borderCurve: 'continuous',
  },
  markerText: {
    ...Type.button,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
