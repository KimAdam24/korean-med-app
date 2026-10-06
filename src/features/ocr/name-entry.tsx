import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { TextInput } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card } from '@/components/card';
import { Radius, Spacing, Type, TypeMaxScale } from '@/constants/theme';
import { medicineWords } from '@/features/drugs/identify-name';
import { useTheme } from '@/hooks/use-theme';
import { hasHangul } from '@/i18n/hangul';
import { Strings } from '@/i18n/strings';

/**
 * Typing the medicine's name from the bottle, where the reading could not give
 * it whole: cut off at the label's edge, damaged, or not found at all.
 *
 * Without a name there is no lookup, so this is what stands between the user
 * and "could not be identified". Prefilled with what was read, so a cut name
 * needs only its end; empty where nothing was.
 *
 * Checked, not trusted: the name is looked up word for word (see
 * `identify-name`), so a misspelling identifies nothing rather than some other
 * medicine, and what it identified as is shown to compare with the bottle. The
 * keyboard's own correction is off for the same reason: a word "corrected" to
 * another medicine's would be a guess the user did not make.
 *
 * The name as read is not accepted back unchanged. It was withheld because it
 * may be cut ("LISINOPRIL" of "LISINOPRIL AND HYDROCHLOROTHIAZIDE"); taking
 * one tap on it as the user's word would undo that without their having
 * looked. A name that really is complete as read can be saved, and given from
 * the edit form, beside the same warning.
 */
export function NameEntry({
  read,
  typed,
  onSubmit,
}: {
  /** The name as read, withheld; absent when none was found. */
  read: string | undefined;
  /** What the user typed before, if anything: the box starts from it. */
  typed?: string;
  onSubmit: (name: string) => void;
}) {
  const theme = useTheme();
  const [value, setValue] = useState(typed ?? read ?? '');
  const name = value.trim();
  // What would be looked up, not the letters typed: "VITAMIN D.", "vitamin-d"
  // and "VITAMIN D" are all asked as "vitamin d", the cut-off name itself. A
  // name with Korean in it is let through, to be told why it is not looked up
  // (`uses.nameHangul`), since the Korean is not among the words compared.
  const lookedUp = (text: string) => medicineWords(text).join(' ');
  const asRead = read !== undefined && !hasHangul(name) && lookedUp(name) === lookedUp(read);
  const ready = name.length > 0 && !asRead;

  return (
    <Card>
      <BilingualText text={Strings.nameEntry.prompt} variant="label" />
      <TextInput
        value={value}
        onChangeText={setValue}
        accessibilityLabel={Strings.nameEntry.inputLabel.ko}
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="characters"
        returnKeyType="search"
        onSubmitEditing={() => ready && onSubmit(name)}
        maxFontSizeMultiplier={TypeMaxScale.body}
        style={[styles.input, { color: theme.text, borderColor: theme.textSecondary, backgroundColor: theme.surface }]}
      />
      <BigButton label={Strings.nameEntry.submit} onPress={() => onSubmit(name)} disabled={!ready} />
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: Type.body.fontSize,
    lineHeight: Type.body.lineHeight,
    borderWidth: 2,
    borderRadius: Radius.inner,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
});
