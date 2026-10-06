import { forwardRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';

import { typeface } from '@/constants/typeface';
import { useBoldTextAdjustment } from '@/features/accessibility/bold-text';

/**
 * React Native's `Text` and `TextInput`, drawn in Pretendard, at the weight
 * the style names raised by the phone's Bold text setting (see `typeface`).
 *
 * The only way the app draws text: React Native has no default font to set, so
 * a `Text` from 'react-native' would be the phone's own font, at a weight Bold
 * text cannot reach. `app-text.test.ts` fails on any file that imports one.
 *
 * It replaces any font a style names: the development panels' monospace is
 * drawn in Pretendard too.
 *
 * Measured and drawn in the same face: React Native lays text out with the
 * typeface the style names, so a weight Android added later, in drawing,
 * could wrap a line past its measured height and cut it off. Here nothing is
 * added later.
 */
export const Text = forwardRef<NativeText, TextProps>(function Text({ style, ...props }, ref) {
  const adjustment = useBoldTextAdjustment();
  const face = typeface(StyleSheet.flatten(style)?.fontWeight, adjustment, Platform.OS);
  return <NativeText ref={ref} {...props} style={[style, face]} />;
});

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  const adjustment = useBoldTextAdjustment();
  const face = typeface(StyleSheet.flatten(style)?.fontWeight, adjustment, Platform.OS);
  return <NativeTextInput ref={ref} {...props} style={[style, face]} />;
});
