import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { IconSize } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The large round icon at the top of a single-purpose screen — the lock, a
 * step of the introduction — that says what the screen is about before a word
 * is read. Decorative: the heading beneath always says it too.
 */
export function Emblem({ icon }: { icon: IconName }) {
  const theme = useTheme();
  return (
    <View style={[styles.emblem, { backgroundColor: theme.primaryWash }]}>
      <Icon name={icon} color={theme.primaryIcon} size={IconSize.hero} />
    </View>
  );
}

const styles = StyleSheet.create({
  emblem: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
