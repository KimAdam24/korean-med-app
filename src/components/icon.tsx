import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { View } from 'react-native';

import { IconSize } from '@/constants/theme';

/**
 * Every icon the app uses, as platform pairs: SF Symbols on iOS, Material
 * Symbols on Android and web — each platform's own iconography, rather than
 * one platform's glyphs worn by the other, or emoji whose colours and shapes
 * vary by vendor and were never contrast-checked.
 */
export const Icons = {
  camera: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
  medicines: { ios: 'pills.fill', android: 'medication', web: 'medication' },
  settings: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  photo: {
    ios: 'photo.on.rectangle',
    android: 'photo_library',
    web: 'photo_library',
  },
  chevron: {
    ios: 'chevron.right',
    android: 'chevron_right',
    web: 'chevron_right',
  },
  lock: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  key: { ios: 'key.fill', android: 'key', web: 'key' },
  erase: { ios: 'trash.fill', android: 'delete', web: 'delete' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  backspace: { ios: 'delete.left', android: 'backspace', web: 'backspace' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  torchOn: {
    ios: 'flashlight.on.fill',
    android: 'flashlight_on',
    web: 'flashlight_on',
  },
  torchOff: {
    ios: 'flashlight.off.fill',
    android: 'flashlight_off',
    web: 'flashlight_off',
  },
} as const satisfies Record<string, SymbolViewProps['name']>;

export type IconName = keyof typeof Icons;

/**
 * A decorative icon. Always beside words that say the same thing, so it is
 * hidden from assistive technology — on Android the symbol is a character in
 * an icon font, which a screen reader would otherwise try to read aloud.
 */
export function Icon({
  name,
  color,
  size = IconSize.row,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{ width: size, height: size }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <SymbolView name={Icons[name]} size={size} tintColor={color} />
    </View>
  );
}
