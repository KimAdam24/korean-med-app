import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { BilingualText } from '@/components/bilingual-text';
import { Icon, type IconName } from '@/components/icon';
import { IconSize, Spacing } from '@/constants/theme';
import { useLargeText } from '@/hooks/use-large-text';
import { useTheme } from '@/hooks/use-theme';
import type { Bilingual } from '@/i18n/strings';

/**
 * One tappable row in a grouped list: an icon, a title, optional detail, and
 * a chevron that says "this opens something".
 *
 * Rows go inside a flush `Card`, separated by `CardDivider`, so a set of
 * related destinations reads as one group rather than a stack of separate
 * outlined buttons that all look equally important.
 *
 * `caution` is for the one row whose action cannot be undone. It is marked by
 * colour *and* by its icon and words — never colour alone.
 */
export function ListRow({
  title,
  detail,
  icon,
  tone = 'default',
  onPress,
  accessibilityLabel,
  children,
}: {
  title: Bilingual;
  detail?: Bilingual;
  icon?: IconName;
  tone?: 'default' | 'caution';
  onPress: () => void;
  accessibilityLabel?: string;
  /** Extra content under the title, such as a status badge. */
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const caution = tone === 'caution';
  // At large text sizes the icon well gives its width to the words; the title
  // already says what the row is.
  const large = useLargeText();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (detail ? `${title.ko}. ${detail.ko}` : title.ko)}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      {icon && !large ? (
        <View
          style={[
            styles.iconWell,
            {
              backgroundColor: caution ? theme.warnSurface : theme.primaryWash,
            },
          ]}>
          <Icon name={icon} color={caution ? theme.warnAccent : theme.primaryIcon} />
        </View>
      ) : null}

      <View style={styles.text}>
        <BilingualText
          text={title}
          variant="title"
          color={caution ? theme.warnAccent : undefined}
          secondaryColor={caution ? theme.warnAccent : undefined}
        />
        {detail ? <BilingualText text={detail} variant="label" hideEnglish /> : null}
        {children}
      </View>

      <Icon name="chevron" color={theme.textSecondary} size={IconSize.row - 4} />
    </Pressable>
  );
}

/**
 * A row that turns one choice on or off: the same layout as `ListRow`, with a
 * switch where the chevron goes.
 *
 * The whole row is the target, as it is for `ListRow`, and it is announced as
 * one switch with its state. The switch drawn at the end only shows the state:
 * it takes no touches of its own, so a tap on it cannot count twice.
 */
export function SwitchRow({
  title,
  icon,
  value,
  onValueChange,
}: {
  title: Bilingual;
  icon?: IconName;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  const large = useLargeText();

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title.ko}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      {icon && !large ? (
        <View style={[styles.iconWell, { backgroundColor: theme.primaryWash }]}>
          <Icon name={icon} color={theme.primaryIcon} />
        </View>
      ) : null}
      <View style={styles.text}>
        <BilingualText text={title} variant="title" />
      </View>
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch
          value={value}
          trackColor={{ false: theme.border, true: theme.primary }}
          thumbColor={theme.surface}
          ios_backgroundColor={theme.border}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four - Spacing.one,
    // Grows with the system font size rather than clipping at a fixed height.
    minHeight: 80,
  },
  iconWell: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.one,
  },
});
