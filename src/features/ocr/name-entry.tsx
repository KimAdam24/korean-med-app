import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { BigButton } from '@/components/big-button';
import { BilingualText } from '@/components/bilingual-text';
import { Card } from '@/components/card';
import { Radius, Spacing, Type, TypeMaxScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
 */
export function NameEntry({ read, onSubmit }: { read: string | undefined; onSubmit: (name: string) => void }) {
  const theme = useTheme();
  const [value, setValue] = useState(read ?? '');
  const name = value.trim();

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
        onSubmitEditing={() => name && onSubmit(name)}
        maxFontSizeMultiplier={TypeMaxScale.body}
        style={[styles.input, { color: theme.text, borderColor: theme.textSecondary, backgroundColor: theme.surface }]}
      />
      <BigButton label={Strings.nameEntry.submit} onPress={() => onSubmit(name)} disabled={name.length === 0} />
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
